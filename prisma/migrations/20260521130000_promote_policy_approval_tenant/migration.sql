-- ═══════════════════════════════════════════════════════════════════
-- Promote PolicyApproval to a first-class tenant-scoped model.
--
-- Until now PolicyApproval was the schema's lone "ownership-chained"
-- model: it carried no tenantId of its own — tenant scope was only
-- inferred via its `policy` relation (Policy.tenantId). Every other
-- domain model carries a direct tenantId. This migration makes
-- PolicyApproval consistent:
--
--   • new NOT NULL tenantId column + FK to Tenant (ON DELETE CASCADE)
--   • backfill from the parent Policy's tenantId
--   • FK reverse-lookup indexes reshaped to tenant-leading composites
--     (replacing the two standalone @@index that the prior
--     perf/fk-reverse-lookup-indexes migration added)
--   • canonical Class-A direct-scoped RLS — tenant_isolation +
--     tenant_isolation_insert + superuser_bypass + FORCE ROW LEVEL
--     SECURITY. This replaces inference-via-`policy` with direct,
--     index-backed row filtering at the database boundary.
--
-- Backfill safety: PolicyApproval.policy is a non-nullable FK with
-- ON DELETE CASCADE, so every existing row has exactly one parent
-- Policy and therefore exactly one tenantId. The UPDATE below sets
-- tenantId for all rows before the column is made NOT NULL.
--
-- RLS shape copied verbatim from the canonical Class-A migration
-- 20260519120000_r26_pra_process_maps (which itself mirrors the
-- Epic G-7 RiskTreatmentPlan migration).
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. New column (nullable first — existing rows must be backfilled) ─

ALTER TABLE "PolicyApproval" ADD COLUMN "tenantId" TEXT;

-- ── 2. Backfill from the parent Policy ───────────────────────────────

UPDATE "PolicyApproval" pa
SET "tenantId" = p."tenantId"
FROM "Policy" p
WHERE p."id" = pa."policyId";

-- ── 3. Tighten to NOT NULL ───────────────────────────────────────────

ALTER TABLE "PolicyApproval" ALTER COLUMN "tenantId" SET NOT NULL;

-- ── 4. Foreign key ──────────────────────────────────────────────────

ALTER TABLE "PolicyApproval"
    ADD CONSTRAINT "PolicyApproval_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 5. Drop the now-superseded standalone FK indexes ─────────────────
-- The perf/fk-reverse-lookup-indexes branch added these as bare
-- single-column indexes because PolicyApproval had no tenantId. With
-- tenant-leading composites in place they are redundant.

DROP INDEX IF EXISTS "PolicyApproval_policyId_idx";
DROP INDEX IF EXISTS "PolicyApproval_policyVersionId_idx";

-- ── 6. Tenant-leading composite indexes ─────────────────────────────

CREATE INDEX IF NOT EXISTS "PolicyApproval_tenantId_policyId_idx"
    ON "PolicyApproval"("tenantId", "policyId");
CREATE INDEX IF NOT EXISTS "PolicyApproval_tenantId_policyVersionId_idx"
    ON "PolicyApproval"("tenantId", "policyVersionId");

-- ── 7. Row Level Security — canonical Class-A direct-scoped setup ────

ALTER TABLE "PolicyApproval" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyApproval" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PolicyApproval";
CREATE POLICY tenant_isolation ON "PolicyApproval"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "PolicyApproval";
CREATE POLICY tenant_isolation_insert ON "PolicyApproval"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "PolicyApproval";
CREATE POLICY superuser_bypass ON "PolicyApproval"
    USING (current_setting('role') != 'app_user');
