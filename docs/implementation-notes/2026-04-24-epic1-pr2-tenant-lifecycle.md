# 2026-04-24 — Epic 1 PR 2: Last-OWNER DB trigger + tenant-creation API + bootstrap

**Commit:** see `feat(epic-1-pr2): last-OWNER DB trigger + tenant-creation API + bootstrap`

## Design

Three interlocking pieces that together guarantee every tenant has at least one
ACTIVE OWNER at all times:

**1. Postgres trigger (`check_not_last_owner`).**
Fires BEFORE UPDATE OR DELETE on `TenantMembership`. The trigger is a
defence-in-depth backstop: if any usecase attempts to demote or remove the last
ACTIVE OWNER, Postgres raises `P0001 LAST_OWNER_GUARD` before the row is written.
The usecase layer carries the same check (PR 4), but the trigger ensures that
even a raw `deleteMany` or a misbehaving cross-cutting concern cannot orphan a
tenant. Migration: `20260424220000_epic1_last_owner_trigger/migration.sql`.

**2. Bootstrap script (`scripts/bootstrap-tenant-owners.ts`).**
One-time idempotent script. For every tenant with zero ACTIVE OWNERs, promotes
the oldest ACTIVE ADMIN membership to OWNER and writes a hash-chained audit
entry (`ROLE_PROMOTED_TO_OWNER`, `reason: MIGRATION_BOOTSTRAP_EPIC1_PR2`).
Tenants that already have an OWNER are skipped. Test-only tenants with no ADMIN
log a `[warn]` and continue — they require manual intervention.

The script avoids a nested Prisma transaction because `appendAuditEntry` opens
its own advisory-locked transaction internally. The UPDATE and audit entry are
issued sequentially on the singleton client.

**3. Platform-admin API routes.**
`POST /api/admin/tenants` and `POST /api/admin/tenants/:slug/transfer-ownership`
are gated by `PLATFORM_ADMIN_API_KEY` (constant-time verified via
`timingSafeEqual`). They sit outside the tenant-session model — no `userId` or
`tenantId` in scope at auth time. The `verifyPlatformApiKey` helper returns void
on success and throws `PlatformAdminError(status, message)` on failure.

`createTenantWithOwner` uses a Prisma `$transaction` that replicates
`createTenantWithDek`'s DEK-generation inline (the singleton `createTenantWithDek`
cannot be called with a transaction client). Audit entries are written after the
transaction commits.

`transferTenantOwnership` promotes the new OWNER before demoting the old one so
the trigger is never tripped during the two-step handover.

## Files

| File | Role |
|---|---|
| `prisma/migrations/20260424220000_epic1_last_owner_trigger/migration.sql` | DB trigger |
| `scripts/bootstrap-tenant-owners.ts` | One-time OWNER bootstrap script |
| `src/env.ts` | Added `PLATFORM_ADMIN_API_KEY` (optional, min 32 chars) |
| `src/lib/auth/platform-admin.ts` | `verifyPlatformApiKey` + `PlatformAdminError` |
| `src/lib/security/rate-limit.ts` | Added `TENANT_CREATE_LIMIT` preset |
| `src/app-layer/usecases/tenant-lifecycle.ts` | `createTenantWithOwner` + `transferTenantOwnership` |
| `src/app/api/admin/tenants/route.ts` | `POST /api/admin/tenants` |
| `src/app/api/admin/tenants/[slug]/transfer-ownership/route.ts` | `POST /api/admin/tenants/:slug/transfer-ownership` |
| `tests/guardrails/api-permission-coverage.test.ts` | Exclusions for platform-admin routes |
| `tests/integration/last-owner-guard.test.ts` | DB trigger assertions |
| `tests/integration/tenant-lifecycle.test.ts` | Usecase assertions |
| `tests/integration/platform-admin-tenant-creation.test.ts` | API key auth assertions |
| `package.json` | Added `db:bootstrap-owners` npm script |

## Decisions

- **Bootstrap script vs. SQL**: Raw SQL UPDATE would bypass `appendAuditEntry`'s
  advisory-lock chain and break hash-chain integrity. The script imports the real
  writer so every promotion is a valid linked audit row.

- **Transaction boundary in `createTenantWithOwner`**: DEK generation is inlined
  inside the `$transaction` callback (not delegated to `createTenantWithDek`)
  because that helper uses the singleton Prisma client and cannot be called with
  a transaction client. The inline pattern matches the existing helper exactly.

- **`verifyPlatformApiKey` length mismatch handling**: `timingSafeEqual` requires
  equal-length Buffers. Rather than returning early on a length mismatch (which
  leaks the length of the expected key), the provided string is written into a
  fixed-length Buffer of the expected length and the first byte is XOR-flipped to
  force a mismatch. The full `timingSafeEqual` call still runs in constant time.

- **Platform-admin routes excluded from `requirePermission` guardrail**: The
  routes live under `src/app/api/admin/` (outside tenant-scoped roots) and have
  their own authentication model. They are added to `EXCLUDED_ROUTES` in the
  guardrail with a written reason.

- **`ensureDefaultTenantMembership` unchanged**: PR 4 handles the auto-join
  vulnerability; this PR intentionally leaves it intact to reduce scope.
