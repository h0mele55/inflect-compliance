# 2026-04-24 — Epic 1: Access Control & Tenant Onboarding

**Commits (chronological):**
- `f9da88e` feat(epic-1-pr1): OWNER role + tenant_lifecycle / owner_management permissions
- `d8a83a1` feat(epic-1-pr2): last-OWNER DB trigger + tenant-creation API + bootstrap
- `e936e0b` feat(epic-1-pr3): token-redemption is now the only path to tenant membership
- `6205372` feat(epic-1-pr4): close GAP-01 — remove auto-ADMIN on OAuth sign-in
- `<this commit>` feat(epic-1-pr5): no-auto-join guardrail + OWNER-role-zod guardrail + docs

Closes GAP-01 (Critical) from the enterprise-readiness audit: OAuth
sign-in no longer silently grants ADMIN on the oldest tenant.
Authentication and tenant membership are now orthogonal concerns.

## Design

```
                        ┌──────────────────────────┐
                        │   NextAuth signIn        │
                        │  (user row only)          │
                        └─────────────┬────────────┘
                                      │
                 ┌────────────────────┼────────────────────┐
                 │                    │                    │
      invite cookie              no invite             bad invite
      ├─ redeemInvite            ├─ user authed        ├─ user authed
      │   └─ membership          │   no membership     │   invite burnt
      │   └─ MEMBER_INVITE_      │   /no-tenant        │   /no-tenant
      │       ACCEPTED audit     │                     │
      │                          ├─────middleware──────┤
      │                          │  /t/slug/** require │
      │                          │  JWT.tenantSlug ==  │
      │                          │  slug else redirect │
      │                          │
      ▼                          ▼
  /t/<slug>/dashboard      Sign-out or wait for invite.
```

The load-bearing property is that **authentication alone never
creates a tenant membership**. The old `ensureDefaultTenantMembership`
called on every sign-in is gone. `ensureTenantMembershipFromInvite`
is a pure no-op without a valid cookie.

## Files

### PR 1 — Enum + permissions (schema-only, behaviour-neutral)
| File | Role |
|---|---|
| `prisma/schema.prisma` | `Role` enum gains `OWNER` (BEFORE `ADMIN`). |
| `prisma/migrations/20260424203836_epic1_add_owner_role/migration.sql` | `ALTER TYPE "Role" ADD VALUE 'OWNER' BEFORE 'ADMIN'`. |
| `src/lib/permissions.ts` | `PermissionSet.admin` gains `tenant_lifecycle`, `owner_management`. OWNER case added; ADMIN explicitly denies both. |
| Role-rank maps in `auth.ts`, `auth/require-admin.ts`, `tenant-context.ts` | `OWNER: 5`. |
| `src/app/api/t/[tenantSlug]/admin/members/(route.ts, [membershipId]/route.ts)` | Zod role enum gains `OWNER`. |
| `src/app-layer/usecases/tenant-admin.ts::VALID_ROLES` | `+ 'OWNER'`. |
| `tests/unit/admin-permissions.test.ts` | New OWNER case + new flags in every existing case. |

### PR 2 — OWNER bootstrap + tenant-creation API + DB trigger
| File | Role |
|---|---|
| `prisma/migrations/<ts>_epic1_last_owner_trigger/migration.sql` | `check_not_last_owner()` plpgsql + BEFORE UPDATE OR DELETE trigger on `TenantMembership`. |
| `scripts/bootstrap-tenant-owners.ts` | Promotes oldest ACTIVE ADMIN per tenant to OWNER + audit entry. Idempotent. |
| `src/app-layer/usecases/tenant-lifecycle.ts` | NEW. `createTenantWithOwner`, `transferTenantOwnership`. |
| `src/app/api/admin/tenants/route.ts` | NEW. `POST` — platform-admin tenant creation. |
| `src/app/api/admin/tenants/[slug]/transfer-ownership/route.ts` | NEW. `POST` — ownership transfer. |
| `src/lib/auth/platform-admin.ts` | NEW. `verifyPlatformApiKey` — constant-time compare against `PLATFORM_ADMIN_API_KEY`. |
| `src/env.ts` | `PLATFORM_ADMIN_API_KEY` optional env. |
| `tests/integration/last-owner-guard.test.ts` | 5 DB-trigger tests. |
| `tests/integration/tenant-lifecycle.test.ts` | 8 usecase tests. |
| `tests/integration/platform-admin-tenant-creation.test.ts` | 5 HTTP tests. |

### PR 3 — Invitation redemption flow
| File | Role |
|---|---|
| `src/app-layer/usecases/tenant-invites.ts` | NEW. `createInviteToken`, `revokeInvite`, `listPendingInvites`, `previewInviteByToken`, `redeemInvite` (Step 1 standalone + Step 2-4 in $transaction). |
| `src/app-layer/usecases/tenant-admin.ts::inviteTenantMember` | Now a thin wrapper calling `createInviteToken`. Vulnerable direct-ACTIVE path deleted. |
| `src/app/api/t/[tenantSlug]/admin/members/route.ts::POST` | Calls `createInviteToken`. Response always `{ invite, url }`. |
| `src/app/api/t/[tenantSlug]/admin/invites/` | NEW directory: GET/POST + DELETE by id. |
| `src/app/api/invites/[token]/route.ts` | NEW. GET preview + POST redeem (public, sign-in-gated). |
| `src/app/api/invites/[token]/accept-redirect/route.ts` | NEW. GET → redeem + 302. |
| `src/app/invite/[token]/page.tsx` | NEW. Preview page. |
| `src/app/no-tenant/page.tsx` | NEW. "You have no access" landing. |
| `src/lib/security/rate-limit.ts` | `TENANT_INVITE_CREATE_LIMIT` (20/hr per tenant), `INVITE_REDEEM_LIMIT` (10/min per IP). |
| `src/lib/errors/types.ts` | `GoneError` + `gone()` factory (HTTP 410). |
| `tests/integration/invite-redemption.test.ts` | 10 usecase tests. |
| `tests/integration/invite-routes.test.ts` | 5 HTTP tests. |

### PR 4 — Remove auto-join + middleware gate + usecase OWNER guards
| File | Role |
|---|---|
| `src/auth.ts` | `ensureDefaultTenantMembership` DELETED. `ensureTenantMembershipFromInvite` (no-op without cookie) replaces it. signIn callback's auto-onboard call sites gone. JWT now carries `tenantSlug`. |
| `src/middleware.ts` | Tenant-access gate added after MFA check. Uses JWT claim, no DB hit. |
| `src/lib/auth/guard.ts` | NEW `checkTenantAccess`, `extractTenantSlugFromPath`, `TenantGateResult`. Public-path carve-outs for `/invite/`, `/no-tenant`, `/api/invites/`. |
| `src/app-layer/usecases/tenant-admin.ts` | `updateTenantMemberRole`: OWNER-boundary checks + last-OWNER count guard. `deactivateTenantMember`: last-OWNER count guard. |
| `src/app/api/invites/[token]/start-signin/route.ts` | NEW. Sets HttpOnly cookie (10-min TTL), 302 to `/login`. |
| `tests/integration/middleware-tenant-gate.test.ts` | 24 pure-function tests. |
| `tests/integration/auth-signin-no-auto-join.test.ts` | 4 signIn-callback tests. |
| `tests/integration/last-owner-usecase-guard.test.ts` | 5 usecase-layer tests. |

### PR 5 — Guardrails + docs (this commit)
| File | Role |
|---|---|
| `tests/guardrails/no-auto-join.test.ts` | NEW. Ratchet on `tenantMembership.create/upsert/createMany` sites + `ensureDefaultTenantMembership` function name check. |
| `tests/guardrails/role-zod-enums.test.ts` | NEW. Ratchet on OWNER inclusion in member-management Zod enums. |
| `docs/epic-1-access-control.md` | NEW. Operator + contributor runbook. |
| `docs/implementation-notes/2026-04-24-epic-1-access-control.md` | NEW. This file. |
| `CLAUDE.md` | New `### Epic 1` section under Architecture. |

## Decisions

**redeemInvite splits Step 1 (atomic claim) into its own transaction.**
If claim + email-check + membership-upsert all run inside one
`$transaction`, Prisma rolls back on any throw — including the
email-mismatch throw. A leaked token would then be re-consumable.
The two-transaction structure ensures `acceptedAt` commits BEFORE
Step 2 can reject, so the invite is burnt even on email mismatch.
Test case 2 in `invite-redemption.test.ts` enforces this invariant.

**Middleware uses JWT claim, not DB lookup.**
Per-request DB hits for the tenant-access gate would add latency to
every protected request. The JWT callback already resolves
`tenantId` + `tenantSlug` at sign-in time. Changes to membership
(promotion, deactivation) take effect on next JWT refresh (existing
`sessionVersion` bump mechanism). Trades freshness for latency;
justified because membership changes are infrequent.

**Platform-admin API key is a separate credential, not a tenant API key.**
A compromised tenant admin should not be able to create more
tenants. The `PLATFORM_ADMIN_API_KEY` env is injected by orchestrator
secret management, never touched by tenant code paths. Routes under
`/api/admin/tenants/**` are the only consumers; `requirePermission`
doesn't gate them (`api-permission-coverage` test has them on the
exclusion list with a written reason).

**OWNER bootstrap picks the OLDEST ACTIVE ADMIN per tenant.**
Not all ADMINs. Alternative considered (promote every ADMIN to
OWNER) rejected because OWNER-management is a distinguished
responsibility — making everyone an OWNER defeats the tier. Oldest
= deterministic = one promotion per tenant. Audit entries let the
operator review and swap via `transfer-ownership` if the wrong
person was promoted.

**No cross-tenant user support yet.** The middleware gate treats any
JWT-to-URL slug mismatch as `no_tenant_access`. A user can only have
one `tenantSlug` claim at a time — the JWT stores "the first tenant
by createdAt" (see `jwt` callback). Multi-tenant users (same email,
multiple tenants) would need a tenant-picker page at sign-in; out of
scope here.

**Last-OWNER guard is enforced at BOTH the usecase layer AND the DB
trigger.** Usecase layer gives friendly errors for normal flows. DB
trigger is the backstop for bypass attempts — raw `deleteMany`,
future bug that skips the check, cross-cutting concerns that forget.
Trigger throws with SQLSTATE P0001 and a specific error message.

## What deliberately isn't here

- **Self-service SaaS signup.** Today there are two tenant-creation
  paths: platform-admin (`POST /api/admin/tenants`) and credentials
  register (`/api/auth/register`, AUTH_TEST_MODE-gated). Neither is
  "anyone with a Google account can click Create Tenant." Building
  the SaaS signup (with billing, email verification, captcha) is a
  separate epic.
- **Multi-tenant users.** A user with memberships in multiple
  tenants currently gets only their oldest tenant in the JWT. A
  tenant-picker page would require session-level tenant switching,
  middleware tenant-slug disambiguation, and UI work. Out of scope.
- **Invitation email delivery.** The existing email infrastructure
  handles this; the invite URL is returned from the create API and
  the caller (UI) dispatches the email. Email templating is Epic 4
  territory.
- **Invite revocation retroactively revokes redeemed memberships.**
  Revoke only marks future redemption impossible. A redeemed
  membership must be deactivated via the member-management UI — the
  two operations are intentionally distinct so an invite-audit
  doesn't destroy real user access.
- **Tenant-creation via CLI / seed.** The existing seed script and
  staging seed endpoint still work as before (both allowlisted in
  `no-auto-join.test.ts`). Epic 1 doesn't touch them.
