-- ════════════════════════════════════════════════════════════════════
-- denorm-tenantId — PolicyControlLink Phase 1: column + backfill
-- ────────────────────────────────────────────────────────────────────
-- Single-table follow-on to the four-table sequence
-- (20260423180000 / 190000 / 200000) that landed denorm-tenantId for
-- EvidenceReview, AuditChecklistItem, FindingEvidence,
-- AuditorPackAccess. Same recipe, shipped as one bundled three-
-- migration PR because the change surface for a single junction
-- table is small enough that per-phase rollback granularity isn't
-- worth a separate PR per phase.
--
-- Notable difference from the four-table sequence: PolicyControlLink
-- joins Policy (tenant-scoped) × Control (intentionally nullable
-- tenantId — library-derived global controls). The pre-denorm
-- chained RLS policy already only walks via Policy, not Control —
-- so the post-denorm composite FK lands on the Policy side only.
-- The Control-side FK stays single-column. This matches the
-- existing protection model exactly.
--
-- Phase 1 (this migration) is purely additive:
--   • (id, tenantId) unique constraint on Policy (composite FK
--     target for Phase 2);
--   • nullable `tenantId` column on PolicyControlLink, backfilled
--     from policy.tenantId;
--   • single-column `tenantId → Tenant.id` FK with ON DELETE SET
--     NULL (matches Prisma `tenant Tenant?` relation; tightened to
--     RESTRICT in Phase 2 once the column is NOT NULL);
--   • (tenantId), (tenantId, policyId), (tenantId, controlId)
--     indexes for the future trivial RLS policy + tenant queries.
-- ════════════════════════════════════════════════════════════════════

-- ─── (id, tenantId) unique constraint on Policy ─────────────────────

DO $$ BEGIN
    ALTER TABLE "Policy" ADD CONSTRAINT "Policy_id_tenantId_key" UNIQUE ("id", "tenantId");
EXCEPTION WHEN duplicate_table OR duplicate_object THEN null; END $$;

-- ─── Add tenantId column (NULL allowed in Phase 1) ──────────────────

ALTER TABLE "PolicyControlLink" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- ─── Backfill from policy.tenantId ──────────────────────────────────
-- Idempotent: re-running with all rows already populated is a no-op.

UPDATE "PolicyControlLink" pcl
SET    "tenantId" = p."tenantId"
FROM   "Policy" p
WHERE  p.id = pcl."policyId"
  AND  pcl."tenantId" IS NULL;

-- ─── Verify zero NULLs (informational) ──────────────────────────────

DO $$
DECLARE c BIGINT;
BEGIN
    SELECT count(*) INTO c FROM "PolicyControlLink" WHERE "tenantId" IS NULL;
    IF c > 0 THEN
        RAISE NOTICE 'PolicyControlLink: % row(s) still NULL after backfill (orphan FK?)', c;
    END IF;
END $$;

-- ─── Indexes for the future trivial RLS policy + tenant queries ─────

CREATE INDEX IF NOT EXISTS "PolicyControlLink_tenantId_idx"
    ON "PolicyControlLink" ("tenantId");

CREATE INDEX IF NOT EXISTS "PolicyControlLink_tenantId_policyId_idx"
    ON "PolicyControlLink" ("tenantId", "policyId");

CREATE INDEX IF NOT EXISTS "PolicyControlLink_tenantId_controlId_idx"
    ON "PolicyControlLink" ("tenantId", "controlId");

-- ─── tenantId → Tenant FK ────────────────────────────────────────────

DO $$ BEGIN
    ALTER TABLE "PolicyControlLink"
        ADD CONSTRAINT "PolicyControlLink_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

SELECT 'PolicyControlLink Phase 1 applied — nullable tenantId column added + backfilled' AS result;
