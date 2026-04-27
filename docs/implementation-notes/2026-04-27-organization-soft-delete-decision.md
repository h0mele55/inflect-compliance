# 2026-04-27 — Organization soft-delete: decision to defer

**Commit:** *(decision record + regression test only, no schema change)*

## Decision

**Defer** adding `Organization.deletedAt`. Document the current
deletion model explicitly and lock the FK-cascade contract with a
DB-backed regression test.

## Why this came up

A review pass on the Epic O-1 hub-and-spoke layer flagged that
`Organization` has no `deletedAt` column and asked whether soft-
delete would improve auditability. The premise framed `Tenant` as
already soft-deletable.

## What's actually true today

The prompt's premise is partially incorrect — neither `Tenant` nor
`Organization` carries a `deletedAt` column. Soft-delete in this
codebase is a **business-entity** pattern, not an identity-layer
pattern. The allowlist in `src/lib/soft-delete.ts::SOFT_DELETE_MODELS`
covers exactly twelve models, all tenant-scoped business content:

```
Asset, Risk, Control, Evidence, Policy, Vendor, FileRecord,
Task, Finding, Audit, AuditCycle, AuditPack
```

Identity-layer tables (`Tenant`, `Organization`, `User`,
`TenantMembership`, `OrgMembership`, custom roles, API keys, SSO
config, etc.) are append-only at the application layer.

**There is no app-level org-deletion path.** A grep for
`organization.delete` in `src/app-layer/**` returns nothing —
zero usecases, zero API routes, zero CLI scripts. The only callers
are integration-test teardowns. Hard-delete is reserved for
DB-level maintenance (postgres role).

## Existing FK contract on org hard-delete

When an organization is hard-deleted (privileged maintenance only),
the cascade behaviour is already explicit in `schema.prisma`:

| Table | FK | onDelete | Effect |
|---|---|---|---|
| `Tenant.organizationId` | nullable | `SET NULL` | Tenants survive as orphans (legacy pre-org behaviour). The slug, name, and all child data are intact. |
| `OrgMembership` | required | `CASCADE` | Membership rows are removed. The audit trail of who-was-in-what-org-when lives in `AuditLog`, not in this table. |
| `TenantMembership.provisionedByOrgId` | nullable, named relation | `SET NULL` | Auto-provisioned AUDITOR memberships survive but lose the back-link. The user remains an AUDITOR of the child tenants — a property the deprovisioning service depends on. |

This is the design `Tenant.organizationId`'s schema comment already
documents inline: "ON DELETE SET NULL so removing an org doesn't
take its tenants with it — orphaned tenants behave like the legacy
pre-org model."

## Why defer

- **No deletion path exists today.** Adding `deletedAt` without a
  delete usecase is speculative. We'd be paying ongoing query-
  filter complexity (every `findMany`, every join, every RLS-
  adjacent path would need to handle the new state) for a flow
  nobody can invoke.
- **Tenant — the parallel concept — has no deletedAt.** Adding it
  to Organization first creates asymmetry. If the identity layer
  ever moves to soft-delete, it should be a designed pair so
  `/org/{slug}` and `/t/{slug}` lifecycle states stay parallel.
- **`onDelete: SetNull` already preserves what matters most.**
  Tenants survive an org hard-delete with all their data and child
  memberships intact. The "less traceable historical link" the
  prompt references is the org's slug + name string, which is also
  preserved in any `AuditLog` row that captured the org-level
  action that affected the tenant.
- **`OrgMembership.onDelete: Cascade` is deliberate.** Membership
  rows are derivative — they don't survive their parent. The audit
  trail of who-was-in-what-org-when is the `AuditLog` (immutable,
  hash-chained, retained per the platform retention policy), NOT
  the live FK chain. Soft-delete on Organization without rethinking
  membership lifecycle would create awkward "deleted org with
  phantom memberships" states.
- **Half-implementing the pattern would mislead operators.**
  Compliance-grade soft-delete in this codebase is not just
  `deletedAt` — it pairs with `deletedByUserId`, `retentionUntil`,
  the `lifecycleSweepDeletedRecords` job that hard-deletes after
  90 days, the `restoreSoftDeletedRecord` usecase, and the
  `@@index([tenantId, deletedAt])` query plan. Adding only the
  column would imply behaviour the code doesn't deliver.
- **No production user has asked for it.** No incident report, no
  roadmap item, no compliance escalation. Speculative gold-plating.

## Trigger conditions for revisiting

Reopen this decision when **any** of these happens:

- A real org-deletion API path is needed (self-service org closure
  for paid plans, GDPR Article 17 right-to-be-forgotten at org
  granularity, regulator-driven erasure).
- A production incident where an accidentally-deleted org cannot
  be recovered without DB-level repair.
- A "restore archived organization" UX shows up on the roadmap.
- `Tenant` gains `deletedAt` for the same reasons — both top-level
  identity tables should share the lifecycle pattern.
- Compliance regulator asks for an organization-level retention
  period (e.g., GDPR retention, HIPAA, SOC 2 evidence-retention
  expansion).

If we revisit, the design must include all of: `deletedAt`,
`deletedByUserId`, `retentionUntil`, repository filtering, RLS
policy update (the `org_isolation` policy's EXISTS subquery would
need to filter for active membership only), an explicit hard-delete
job, a restore usecase, and a matched migration on `Tenant`.

## What ships in this PR instead

1. This decision record — durable rationale next to the schema.
2. `tests/integration/org-deletion-contract.test.ts` — DB-backed
   regression test that locks the FK behaviour above so a future
   "tidy up the cascade" PR cannot silently change `SetNull` to
   `Cascade` (or vice versa) without surfacing the intent.

No schema change, no API surface change, no migration.

## Files

| File | Role |
|---|---|
| `docs/implementation-notes/2026-04-27-organization-soft-delete-decision.md` | This decision record. |
| `tests/integration/org-deletion-contract.test.ts` | Regression test on the existing FK cascade behaviour. |

## Decisions

- **Defer over implement.** The cost of carrying soft-delete
  scaffolding for a non-existent flow exceeds the benefit. The
  benefit (better historical linkage when an org is deleted) is
  already captured by `onDelete: SetNull` + the immutable audit
  log.
- **Document the deletion contract via a test, not a column.** A
  regression test on the existing FK behaviour is the
  highest-leverage durable artefact: it captures the *intent*
  (Tenant survives, OrgMembership doesn't, provisioned-by link
  goes to NULL), runs in CI, and surfaces any future change as
  a deliberate review rather than an accidental tweak.
- **Treat identity-layer soft-delete as a paired design.** If we
  later add `deletedAt`, do it on `Tenant` and `Organization`
  together with the full lifecycle stack (`deletedByUserId`,
  `retentionUntil`, restore flow, sweep job). Half-implementations
  on identity tables are footguns.
