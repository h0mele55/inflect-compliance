# 2026-04-30 — Epic D: Org Invitation & Lifecycle

**Commit:** _(pending)_

Closes the org-onboarding gap. Before this PR, the only ways to join
an org were (1) self-service org creation (you create the org, you're
ORG_ADMIN of it) and (2) the platform-admin direct-add path
(`addOrgMember`). There was no token-bound invite flow for an admin
to onboard a teammate by email. Tenant invites had had `TenantInvite`
since Epic 1; orgs lacked the equivalent.

## Design

```
                         ┌──────────────────────────────────────┐
  ORG_ADMIN              │   POST /api/org/:slug/invites        │
       │                 │   body: { email, role }              │
       └─────────────▶   └──────┬───────────────────────────────┘
                                │  createOrgInviteToken()
                                ▼
                  ┌─────────────────────────────────────┐
                  │  OrgInvite row                       │
                  │   ‒ token = randomBytes(32) base64url│
                  │   ‒ expiresAt = now + 7d             │
                  │   ‒ unique on (organizationId,email) │
                  │   ‒ ORG_INVITE_CREATED audit         │
                  │  url: /invite/org/<token>            │
                  └─────────────────────────────────────┘
                                │
                                │  shared out-of-band (email/Slack)
                                ▼
                  ┌─────────────────────────────────────┐
                  │  Recipient lands on                  │
                  │   /invite/org/<token>                │
                  │   ‒ previewOrgInviteByToken()        │
                  │   ‒ valid+match  → <Accept> button   │
                  │   ‒ valid+other  → "switch accounts" │
                  │   ‒ invalid      → single 410 shape  │
                  └─────────────────────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
     not-signed-in       signed-in+match    signed-in+mismatch
              │                 │                 │
   /api/org/invite/<t>/         <form action=     guidance to sign
   start-signin sets            /api/org/invite/  out + sign in with
   inflect_org_invite_          <t>/accept-redir  the right account
   token cookie + → /login      ect>
              │                 │
              ▼                 ▼
   OAuth → signIn callback    redeemOrgInvite()
   reads cookie, calls         atomic claim + email-bind +
   redeemOrgInvite()           OrgMembership upsert + audit
              │                 │
              └────────┬────────┘
                       ▼
              OrgMembership row + audit:
                ORG_INVITE_REDEEMED
                ORG_MEMBER_ADDED
                ORG_ADMIN_PROVISIONED_TO_TENANTS (if ORG_ADMIN)
                       ▼
              Redirect → /org/<slug>
```

## Decisions

- **Mirror `TenantInvite` exactly.** The tenant-invite usecase
  already had every property Epic D's prompt asked for (atomic
  claim, email binding, single-use, anti-enumeration, secure token,
  TTL). Inventing a different lifecycle for orgs would be churn.
  The `OrgInvite` model has the same field set + same indexes; the
  `org-invites.ts` usecase mirrors `tenant-invites.ts` line-for-line
  swapping `tenantId` → `organizationId` and `Role` → `OrgRole`.

- **Token: 32 random bytes, base64url, stored raw.** No HMAC. The
  `crypto.randomBytes(32)` entropy (256 bits) is the security
  boundary; hashing the token at rest would make support
  ("why is this invite not working?") harder without adding real
  protection. Same call as TenantInvite. The DB column is `@unique`.

- **Two-phase atomic claim.** Step 1 is a standalone
  `updateMany({where:{token, acceptedAt:null, revokedAt:null,
  expiresAt:{gt:now()}}, data:{acceptedAt:now()}})`. The first
  caller whose predicate matches gets `count=1`; concurrent
  redemptions get `count=0`. Step 3 (email-binding) runs AFTER the
  claim commits, so an email-mismatch BURNS the token —
  preventing token replay if the link leaks.

- **Distinct cookie name + URL path.** `inflect_org_invite_token`
  cookie + `/invite/org/<token>` URL. A user with both a tenant
  invite and an org invite pending shouldn't have one wipe the
  other. The auth `signIn` callback reads BOTH cookies on initial
  sign-in and redeems each in turn.

- **Anti-enumeration: single 410 response shape.** `previewOrg
  InviteByToken` returns `null` for every "not redeemable" state
  (expired / revoked / accepted / not-found). The route returns 410
  Gone with a generic body. An attacker probing with random tokens
  can't distinguish "this token never existed" from "this token is
  used up". Mirrors the tenant-invite path.

- **Best-effort audit, post-commit.** Same pattern as Epic B's
  `emitOrgAudit` — the privilege change is durable in the DB by
  the time `appendOrgAuditEntry` is called, so a writer failure
  logs but doesn't undo the membership. Failing the user-facing
  operation here would be worse than a recoverable audit gap (the
  chain-verification job can backfill).

- **Three audit rows on successful ORG_ADMIN redemption.**
  ORG_INVITE_REDEEMED (the consumption), ORG_MEMBER_ADDED (the new
  membership), ORG_ADMIN_PROVISIONED_TO_TENANTS (the fan-out
  summary). Compliance reviewers see cause + effect as distinct
  events ordered by `occurredAt`. ORG_READER redemption emits only
  the first two.

- **No auto-join, env-flag-gated future.** `ensureDefault
  OrgMembership` does not exist in the codebase today. The
  `tests/guardrails/no-auto-join.test.ts` guardrail now has a
  sentinel that fails if the function name reappears AND a
  `ALLOWLISTED_ORG_MEMBERSHIP_SITES` allowlist enforcing that any
  new `orgMembership.create/upsert/createMany` site must be
  reviewed + listed. Production cannot silently auto-join users
  even if a future PR tries.

- **Notification email is OUT-OF-BAND for now.** The invite-
  creation API returns the URL in the response body and the UI
  shows it to the admin to copy/paste. This matches the
  TenantInvite path and avoids tying the rollout to a not-yet-
  built `MEMBER_INVITED` notification type. When that notification
  type lands, plug in `notifications/enqueue.ts` from
  `createOrgInviteToken` — the call site is one line.

## Files

| File | Role |
|---|---|
| `prisma/schema/auth.prisma` | New `OrgInvite` model + inverse relations on `Organization` and `User`. Mirrors `TenantInvite`. |
| `prisma/schema/enums.prisma` | `OrgAuditAction` extended with `ORG_INVITE_CREATED`, `ORG_INVITE_REDEEMED`, `ORG_INVITE_REVOKED`. |
| `prisma/migrations/20260430073810_epic_d_org_invite/migration.sql` | NEW. CREATE TABLE + indexes + FKs + 3 enum extensions. The 3 unrelated `DROP NOT NULL` lines prisma-migrate emitted for User/AuditorAccount/UserIdentityLink were intentionally STRIPPED to preserve the GAP-21 schema-DB drift on `emailHash`. |
| `src/app-layer/usecases/org-invites.ts` | NEW. `createOrgInviteToken`, `revokeOrgInvite`, `listPendingOrgInvites`, `previewOrgInviteByToken`, `redeemOrgInvite`. Plus a private `safeOrgAudit` helper. |
| `src/app/api/org/[orgSlug]/invites/route.ts` | NEW. POST (create) + GET (list pending). ORG_ADMIN-only via `canManageMembers`. |
| `src/app/api/org/[orgSlug]/invites/[inviteId]/route.ts` | NEW. DELETE (revoke). |
| `src/app/api/org/invite/[token]/route.ts` | NEW. GET (preview, anti-enumeration 410) + POST (redeem). Rate-limited per IP via `INVITE_REDEEM_LIMIT`. |
| `src/app/api/org/invite/[token]/start-signin/route.ts` | NEW. Sets `inflect_org_invite_token` cookie + redirects to `/login`. |
| `src/app/api/org/invite/[token]/accept-redirect/route.ts` | NEW. Form-submit target: redeem then 303 redirect to `/org/<slug>` on success or back to `/invite/org/<token>?error=` on failure. |
| `src/app/invite/org/[token]/page.tsx` | NEW. Server-rendered acceptance page. Three states (valid+match, valid+mismatch, invalid). |
| `src/app/org/[orgSlug]/(app)/members/page.tsx` | Now also fetches `listPendingOrgInvites` and passes to the table. |
| `src/app/org/[orgSlug]/(app)/members/MembersTable.tsx` | New "Invite by email" header button + InviteMemberModal + PendingInvitesSection (table of pending invites with revoke action). |
| `src/auth.ts` | `readInviteTokenFromCookies` now returns `{tenantToken, orgToken}`. New `ensureOrgMembershipFromInvite` helper called from the same call sites as `ensureTenantMembershipFromInvite`. Docstring updated to reference both invite types. |
| `tests/guardrails/no-auto-join.test.ts` | New `ALLOWLISTED_ORG_MEMBERSHIP_SITES` allowlist + the existing `ensureDefaultTenantMembership` sentinel mirrored as `ensureDefaultOrgMembership` for Epic D's hardening requirement. |
| `tests/guardrails/org-audit-coverage.test.ts` | Adds `ORG_INVITE_MUTATION_RE` + a per-file assertion that any file mutating `OrgInvite` calls `appendOrgAuditEntry`. The existing enum-completeness check picks up the 3 new `ORG_INVITE_*` values automatically. |
| `tests/integration/org-invite-lifecycle.test.ts` | NEW. Real DB. Six tests covering create + audit, anti-enumeration, atomic claim, email-mismatch burn, revoke + audit. |
| `tests/unit/org-invite-route.test.ts` | NEW. Eight tests covering RBAC (403 for ORG_READER), success/error shapes, anti-enumeration 410, redeem 401. |

## Verification

- `npx tsc --noEmit` — clean.
- 68/68 across the 8 Epic-D-touching suites: integration lifecycle (6), route unit (8), guardrails (12), existing org-members-usecase (20), existing org-audit-emission (11), existing org-members-routes (8), existing org-audit-immutability (5).
- Migration applied to local DB; `prisma generate` produced the new `OrgInvite` accessor + extended `OrgAuditAction` enum.
- The `ensureDefaultOrgMembership` sentinel in `no-auto-join.test.ts` correctly reports zero hits today (no auto-bootstrap exists).

## Production vs non-production behavior

- **Production**: invite-gated onboarding only. New OrgMemberships
  arrive through (a) `addOrgMember` (admin direct-add by user id),
  (b) `redeemOrgInvite` (token-bound, email-bound), or (c) self-
  service org creation (you create the org, you're its sole
  ORG_ADMIN). NO auto-join paths.
- **Development/test**: identical behavior. There is no dev-time
  "skip the invite" override. Local seeds use platform-admin tenant
  bootstrap (`createTenantWithOwner`) for the same reason — explicit
  is safer than convenient when the alternative is a privilege-
  escalation foot-gun.

If a future feature needs a dev-time bootstrap, it must:

  1. Be guarded behind an env flag with `superRefine` rejection in
     production (per the canonical pattern in `src/env.ts`).
  2. Add itself to `ALLOWLISTED_ORG_MEMBERSHIP_SITES` in the
     guardrail with a written reason.
  3. Use a name distinct from `ensureDefaultOrgMembership` —
     that exact name is sentinel-blocked.
