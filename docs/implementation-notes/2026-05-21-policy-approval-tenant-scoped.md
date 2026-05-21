# 2026-05-21 — Promote PolicyApproval to a first-class tenant-scoped model

**Commit:** `<sha>` feat(schema): promote PolicyApproval to a first-class tenant-scoped model

## Design

`PolicyApproval` was the schema's lone "ownership-chained" tenant-scoped
model that still carried no `tenantId` of its own — tenant scope was
inferred entirely through its non-nullable `policy` relation
(`Policy.tenantId`). Every other domain model carries a direct
`tenantId` column with canonical Class-A direct-scoped RLS. This change
makes `PolicyApproval` consistent with the rest of the schema.

The promotion has three load-bearing parts:

1. **Direct `tenantId` column.** `NOT NULL`, FK to `Tenant` with
   `ON DELETE CASCADE`. Backfilled from the parent `Policy.tenantId`
   before the `NOT NULL` tighten — every existing row has exactly one
   parent `Policy` (the FK is non-nullable), so the backfill is total.

2. **Index reshape.** The `perf/fk-reverse-lookup-indexes` branch had
   just added two standalone FK indexes (`@@index([policyId])`,
   `@@index([policyVersionId])`) precisely because there was no
   `tenantId` to lead a composite. With `tenantId` in place those are
   replaced by tenant-leading composites
   `@@index([tenantId, policyId])` and
   `@@index([tenantId, policyVersionId])`. `tenantId` leads both, so
   Layer A of the schema-index guardrail is satisfied without a
   separate `@@index([tenantId])`.

3. **Direct RLS.** The canonical Class-A three-policy setup —
   `tenant_isolation` (USING), `tenant_isolation_insert`
   (FOR INSERT WITH CHECK), `superuser_bypass` (USING role) — plus
   `FORCE ROW LEVEL SECURITY`. Row filtering now happens directly on
   `PolicyApproval.tenantId` instead of an EXISTS subquery walking the
   parent `Policy`. The shape was copied verbatim from
   `20260519120000_r26_pra_process_maps` (itself a mirror of the
   Epic G-7 `RiskTreatmentPlan` migration).

The `rls-coverage` guardrail derives its tenant-model set from the live
Prisma DMMF, so adding the `tenantId` column automatically pulled
`PolicyApproval` into the set that REQUIRES `tenant_isolation` +
`superuser_bypass` + `FORCE ROW LEVEL SECURITY`. The migration was
written to satisfy that guardrail.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/compliance.prisma` | `PolicyApproval`: add `tenantId` + `tenant` relation; swap standalone FK indexes for tenant-leading composites |
| `prisma/schema/auth.prisma` | `Tenant`: add `policyApprovals PolicyApproval[]` back-relation |
| `prisma/migrations/20260521130000_promote_policy_approval_tenant/migration.sql` | Add column → backfill → NOT NULL → FK → drop old indexes → composites → RLS |
| `src/app-layer/repositories/PolicyApprovalRepository.ts` | `create` sets `tenantId`; all reads/writes filter by `ctx.tenantId`; `getById` now takes `ctx`; `decide` uses `updateMany` + `findFirst` so the WHERE can carry the tenant filter |
| `src/app-layer/usecases/policy.ts` | `getById` call site passes `ctx`; null-guard on `decide` result; dropped an `as any` cast now that `getById` is typed |
| `src/lib/db/rls-middleware.ts` | Removed `PolicyApproval` from the hand-curated `OWNERSHIP_CHAINED_MODELS` list — it is now enumerated from the DMMF |
| `tests/guardrails/schema-index-coverage.test.ts` | Added `PolicyApproval` to `LIST_MODELS_TENANT_INDEX_SUFFICIENT` (it is `findMany`-queried by `listPending`) |
| `tests/unit/rls-middleware.test.ts` | Reclassified `PolicyApproval` from the Class-E spot-check group to Class A |

## Decisions

- **`decide` uses `updateMany` + `findFirst`, not `update`.** Prisma's
  `update` only accepts unique fields in its `where`, so a `tenantId`
  defence-in-depth filter cannot be added to a `where: { id }` update.
  Switching to `updateMany` (which accepts arbitrary filters) lets the
  WHERE carry `tenantId: ctx.tenantId`, with a follow-up `findFirst`
  for the relation includes the usecase needs. The RLS policy is the
  real isolation backstop; the application-layer filter is
  defence-in-depth per the repo convention.

- **`getById` gained a `ctx` parameter.** It previously took only
  `(db, id)` and relied on the usecase to verify
  `approval.policy.tenantId === ctx.tenantId` afterwards. With a direct
  `tenantId` the repository can — and per convention should — filter at
  the query. The single caller (`decidePolicyApproval`) was updated.

- **Indexes are tenant-leading composites, not a separate
  `@@index([tenantId])` plus standalone FK indexes.** A
  `[tenantId, policyId]` composite serves both the universal
  `WHERE tenantId = ?` scan (leftmost prefix) and the
  `WHERE tenantId = ? AND policyId = ?` reverse lookup, so two
  composites replace three single-column indexes with no coverage loss.

- **Removed from `OWNERSHIP_CHAINED_MODELS`.** Leaving it there would
  be harmless (the final set is deduped) but stale and misleading —
  `enumerateDirectTenantScopedModels()` now picks it up from the DMMF.
