# 2026-04-24 — Epic 1 PR 3: Token-Redemption Invite Flow

**Commit:** `f24ec9a feat(epic-1-pr3): token-redemption is now the only path to tenant membership`

## Design

The old `inviteTenantMember` had a silent shortcut: if the invitee's email already existed
as a `User` row, the function created an `ACTIVE` TenantMembership immediately — no token,
no email verification, no consent from the invitee. This meant any ADMIN who knew a victim's
email could silently add them to the tenant.

This PR closes that gap by making `redeemInvite` the **only** path to a new membership row:

```
ADMIN → createInviteToken → TenantInvite row (token + expiresAt)
                                   ↓ (email sent out-of-band)
Invitee → /invite/[token] → previewInviteByToken (no side effects)
                                   ↓ (signs in)
Invitee → POST /api/invites/:token → redeemInvite
              ↳ $transaction: updateMany claim + email bind + upsert membership
              ↳ appendAuditEntry (post-commit, outside $tx)
```

The atomic claim uses `tenantInvite.updateMany` with all liveness predicates in the WHERE
clause. This is a "test-and-set" — Postgres serializes concurrent callers on the same row;
exactly one wins count=1 and the rest get count=0.

Email binding is strict and burns the token even on mismatch: once `acceptedAt` is set,
the token is unconditionally consumed. If the wrong user redeems, the inviter must re-invite.
This prevents token-forwarding attacks.

## Files

| File | Role |
|---|---|
| `src/app-layer/usecases/tenant-invites.ts` | New — five exported functions (create, revoke, list, preview, redeem) |
| `src/app-layer/usecases/tenant-admin.ts` | Modified — old invite functions replaced with thin delegation wrappers |
| `src/app/api/t/[tenantSlug]/admin/invites/route.ts` | New — GET (list) + POST (create, rate-limited 20/hr) |
| `src/app/api/t/[tenantSlug]/admin/invites/[inviteId]/route.ts` | New — DELETE (revoke) |
| `src/app/api/invites/[token]/route.ts` | New — GET preview + POST redeem (public, sign-in gated) |
| `src/app/api/invites/[token]/accept-redirect/route.ts` | New — GET → redeem + 302 to dashboard |
| `src/app/invite/[token]/page.tsx` | New — server component invite preview page |
| `src/app/no-tenant/page.tsx` | New — landing for users with no active membership |
| `src/lib/errors/types.ts` | Modified — added GoneError + gone() (HTTP 410) |
| `src/lib/security/rate-limit.ts` | Modified — TENANT_INVITE_CREATE_LIMIT + INVITE_REDEEM_LIMIT |
| `src/lib/security/route-permissions.ts` | Modified — admin.invites rule |
| `tests/integration/invite-redemption.test.ts` | New — 10 DB-backed scenarios |
| `tests/integration/invite-routes.test.ts` | New — HTTP-contract scenarios |

## Decisions

- **Atomic claim via `updateMany`** — not `findUnique` + `update` (two queries, TOCTOU race).
  The WHERE predicates in `updateMany` are evaluated atomically by Postgres under serializable
  isolation. Ten concurrent callers → exactly one count=1.

- **Email binding burns the token on mismatch** — safer than reversing the claim. A re-invited
  attacker cannot retry with the same token after a failed email-mismatch attempt.

- **`appendAuditEntry` called post-commit** — the audit writer opens its own advisory-locked
  `$transaction`. Calling it from inside `redeemInvite`'s outer `$transaction` would create a
  nested transaction under PgBouncer's transaction-pooling mode, which Prisma does not support.
  The membership is committed before the audit fires; the audit can never undo the write.

- **`previewInviteByToken` uses the global Prisma client** (not `runInTenantContext`) because
  the caller has no `RequestContext` — they are not yet a tenant member. The function is
  read-only and emits no audit events.

- **`inviteTenantMember` kept as a thin wrapper** — ensures existing callers (the old
  `admin/members` POST route, unit tests) don't break while the API surface migrates.
  Marked `DEPRECATED` in its docstring.

- **`gone()` factory** added rather than reusing `deprecatedResource` — the semantics are
  different (invite-expired vs. deprecated API endpoint). HTTP 410 is the correct status
  for "this resource existed but is permanently gone."

- **Invite TTL is hardcoded at 7 days** — `TenantSecuritySettings` has no `inviteMaxAgeDays`
  column yet. A TODO comment marks the extension point for when that column lands.
