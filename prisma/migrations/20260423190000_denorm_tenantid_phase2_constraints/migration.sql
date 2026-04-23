-- ════════════════════════════════════════════════════════════════════
-- denorm-tenantId — Phase 2: NOT NULL + composite parent FK
-- ────────────────────────────────────────────────────────────────────
-- Tightens Phase 1's nullable column into a NOT NULL invariant and
-- swaps the single-column parent FK for a composite (parentFK,
-- tenantId) → Parent(id, tenantId).
--
-- The composite FK is the structural payload of this whole
-- denormalisation: the database now refuses to store a child whose
-- tenantId disagrees with its parent's, even under a SECURITY
-- DEFINER bypass or a future admin migration that skips RLS. For
-- junctions (FindingEvidence, AuditorPackAccess) this is enforced
-- per parent — each composite FK independently asserts the same
-- tenantId, so transitively both parents agree.
--
-- Pre-flight blocks:
--   1. Defensive re-backfill (covers any rows inserted by a
--      Phase-0 binary still serving traffic during deploy).
--   2. RAISE EXCEPTION on residual NULL tenantId (would block the
--      SET NOT NULL anyway; raising explicitly gives a useful row
--      count in the migration log).
--   3. RAISE EXCEPTION on composite-FK violations (rows that would
--      be rejected by the new FK ADD).
--
-- Tenant FK is also tightened: Phase 1 used ON DELETE SET NULL
-- because the column was nullable; Phase 2 uses ON DELETE RESTRICT
-- because (a) the column is NOT NULL and SET NULL would error
-- anyway, and (b) the composite parent FK already governs cascade
-- semantics for the row's lifecycle.
--
-- Rollback:
--   • DROP composite FKs and re-add single-column FKs.
--   • ALTER COLUMN tenantId DROP NOT NULL.
--   • Restore tenant FK to ON DELETE SET NULL.
--   • The tenantId column itself is preserved (Phase 1 state).
-- ════════════════════════════════════════════════════════════════════

-- ─── Pre-flight 1: defensive re-backfill ────────────────────────────
-- Idempotent on rows already populated. Ensures the Phase 1 backfill
-- "result" still holds even if a Phase-0 binary wrote new rows
-- between Phase 1 deploy and Phase 2 deploy.

UPDATE "EvidenceReview" er
SET    "tenantId" = e."tenantId"
FROM   "Evidence" e
WHERE  e.id = er."evidenceId"
  AND  er."tenantId" IS NULL;

UPDATE "AuditChecklistItem" aci
SET    "tenantId" = a."tenantId"
FROM   "Audit" a
WHERE  a.id = aci."auditId"
  AND  aci."tenantId" IS NULL;

UPDATE "FindingEvidence" fe
SET    "tenantId" = f."tenantId"
FROM   "Finding" f
WHERE  f.id = fe."findingId"
  AND  fe."tenantId" IS NULL;

UPDATE "AuditorPackAccess" apa
SET    "tenantId" = ap."tenantId"
FROM   "AuditPack" ap
WHERE  ap.id = apa."auditPackId"
  AND  apa."tenantId" IS NULL;

-- ─── Pre-flight 2: zero NULL tenantId ───────────────────────────────

DO $$
DECLARE c BIGINT;
BEGIN
    SELECT count(*) INTO c FROM "EvidenceReview"     WHERE "tenantId" IS NULL;
    IF c > 0 THEN RAISE EXCEPTION 'EvidenceReview: % NULL tenantId rows — Phase 2 cannot proceed (orphan FK?)', c; END IF;

    SELECT count(*) INTO c FROM "AuditChecklistItem" WHERE "tenantId" IS NULL;
    IF c > 0 THEN RAISE EXCEPTION 'AuditChecklistItem: % NULL tenantId rows — Phase 2 cannot proceed (orphan FK?)', c; END IF;

    SELECT count(*) INTO c FROM "FindingEvidence"    WHERE "tenantId" IS NULL;
    IF c > 0 THEN RAISE EXCEPTION 'FindingEvidence: % NULL tenantId rows — Phase 2 cannot proceed (orphan FK?)', c; END IF;

    SELECT count(*) INTO c FROM "AuditorPackAccess"  WHERE "tenantId" IS NULL;
    IF c > 0 THEN RAISE EXCEPTION 'AuditorPackAccess: % NULL tenantId rows — Phase 2 cannot proceed (orphan FK?)', c; END IF;
END $$;

-- ─── Pre-flight 3: composite FK violations ──────────────────────────
-- Verify that every (parentFK, tenantId) tuple has a matching
-- (parent.id, parent.tenantId). The composite FK ADD would reject
-- mismatched rows; we surface that here with a clear error rather
-- than the generic FK-violation message.

DO $$
DECLARE c BIGINT;
BEGIN
    SELECT count(*) INTO c FROM "EvidenceReview" er
    LEFT JOIN "Evidence" e ON e.id = er."evidenceId" AND e."tenantId" = er."tenantId"
    WHERE e.id IS NULL;
    IF c > 0 THEN RAISE EXCEPTION 'EvidenceReview: % rows have evidenceId/tenantId pairs that do not match any Evidence(id, tenantId)', c; END IF;

    SELECT count(*) INTO c FROM "AuditChecklistItem" aci
    LEFT JOIN "Audit" a ON a.id = aci."auditId" AND a."tenantId" = aci."tenantId"
    WHERE a.id IS NULL;
    IF c > 0 THEN RAISE EXCEPTION 'AuditChecklistItem: % rows have auditId/tenantId pairs that do not match any Audit(id, tenantId)', c; END IF;

    SELECT count(*) INTO c FROM "FindingEvidence" fe
    LEFT JOIN "Finding" f ON f.id = fe."findingId" AND f."tenantId" = fe."tenantId"
    WHERE f.id IS NULL;
    IF c > 0 THEN RAISE EXCEPTION 'FindingEvidence: % rows have findingId/tenantId pairs that do not match any Finding(id, tenantId)', c; END IF;

    SELECT count(*) INTO c FROM "FindingEvidence" fe
    LEFT JOIN "Evidence" e ON e.id = fe."evidenceId" AND e."tenantId" = fe."tenantId"
    WHERE e.id IS NULL;
    IF c > 0 THEN RAISE EXCEPTION 'FindingEvidence: % rows have evidenceId/tenantId pairs that do not match any Evidence(id, tenantId)', c; END IF;

    SELECT count(*) INTO c FROM "AuditorPackAccess" apa
    LEFT JOIN "AuditPack" ap ON ap.id = apa."auditPackId" AND ap."tenantId" = apa."tenantId"
    WHERE ap.id IS NULL;
    IF c > 0 THEN RAISE EXCEPTION 'AuditorPackAccess: % rows have auditPackId/tenantId pairs that do not match any AuditPack(id, tenantId)', c; END IF;

    SELECT count(*) INTO c FROM "AuditorPackAccess" apa
    LEFT JOIN "AuditorAccount" aa ON aa.id = apa."auditorId" AND aa."tenantId" = apa."tenantId"
    WHERE aa.id IS NULL;
    IF c > 0 THEN RAISE EXCEPTION 'AuditorPackAccess: % rows have auditorId/tenantId pairs that do not match any AuditorAccount(id, tenantId)', c; END IF;
END $$;

-- ─── SET NOT NULL on tenantId ───────────────────────────────────────

ALTER TABLE "EvidenceReview"     ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "AuditChecklistItem" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "FindingEvidence"    ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "AuditorPackAccess"  ALTER COLUMN "tenantId" SET NOT NULL;

-- ─── Tighten tenant FK: SET NULL → RESTRICT ─────────────────────────
-- With the column NOT NULL, ON DELETE SET NULL would error rather
-- than cascade. RESTRICT is the correct choice — Tenants in this
-- system are not intended to be hard-deleted while child rows
-- exist; row-lifecycle for the children is governed by the
-- composite parent FK below (which can CASCADE).

ALTER TABLE "EvidenceReview"     DROP CONSTRAINT IF EXISTS "EvidenceReview_tenantId_fkey";
ALTER TABLE "EvidenceReview"     ADD  CONSTRAINT "EvidenceReview_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuditChecklistItem" DROP CONSTRAINT IF EXISTS "AuditChecklistItem_tenantId_fkey";
ALTER TABLE "AuditChecklistItem" ADD  CONSTRAINT "AuditChecklistItem_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FindingEvidence"    DROP CONSTRAINT IF EXISTS "FindingEvidence_tenantId_fkey";
ALTER TABLE "FindingEvidence"    ADD  CONSTRAINT "FindingEvidence_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuditorPackAccess"  DROP CONSTRAINT IF EXISTS "AuditorPackAccess_tenantId_fkey";
ALTER TABLE "AuditorPackAccess"  ADD  CONSTRAINT "AuditorPackAccess_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Composite parent FKs ───────────────────────────────────────────
-- Each statement: drop the existing single-column FK (which only
-- enforced parent existence), add a composite (parentFK, tenantId)
-- → Parent(id, tenantId). The composite name follows Prisma's own
-- naming convention so `prisma migrate diff` reports a clean state
-- after this migration applies.

-- EvidenceReview
ALTER TABLE "EvidenceReview" DROP CONSTRAINT IF EXISTS "EvidenceReview_evidenceId_fkey";
ALTER TABLE "EvidenceReview" ADD  CONSTRAINT "EvidenceReview_evidenceId_tenantId_fkey"
    FOREIGN KEY ("evidenceId", "tenantId") REFERENCES "Evidence"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AuditChecklistItem
ALTER TABLE "AuditChecklistItem" DROP CONSTRAINT IF EXISTS "AuditChecklistItem_auditId_fkey";
ALTER TABLE "AuditChecklistItem" ADD  CONSTRAINT "AuditChecklistItem_auditId_tenantId_fkey"
    FOREIGN KEY ("auditId", "tenantId") REFERENCES "Audit"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- FindingEvidence — junction, two composite FKs
ALTER TABLE "FindingEvidence" DROP CONSTRAINT IF EXISTS "FindingEvidence_findingId_fkey";
ALTER TABLE "FindingEvidence" ADD  CONSTRAINT "FindingEvidence_findingId_tenantId_fkey"
    FOREIGN KEY ("findingId", "tenantId") REFERENCES "Finding"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FindingEvidence" DROP CONSTRAINT IF EXISTS "FindingEvidence_evidenceId_fkey";
ALTER TABLE "FindingEvidence" ADD  CONSTRAINT "FindingEvidence_evidenceId_tenantId_fkey"
    FOREIGN KEY ("evidenceId", "tenantId") REFERENCES "Evidence"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AuditorPackAccess — junction, two composite FKs (no CASCADE per
-- Phase 1 schema: revoking a pack/auditor is an explicit operation,
-- not an implicit consequence of deleting either parent).
ALTER TABLE "AuditorPackAccess" DROP CONSTRAINT IF EXISTS "AuditorPackAccess_auditPackId_fkey";
ALTER TABLE "AuditorPackAccess" ADD  CONSTRAINT "AuditorPackAccess_auditPackId_tenantId_fkey"
    FOREIGN KEY ("auditPackId", "tenantId") REFERENCES "AuditPack"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuditorPackAccess" DROP CONSTRAINT IF EXISTS "AuditorPackAccess_auditorId_fkey";
ALTER TABLE "AuditorPackAccess" ADD  CONSTRAINT "AuditorPackAccess_auditorId_tenantId_fkey"
    FOREIGN KEY ("auditorId", "tenantId") REFERENCES "AuditorAccount"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

SELECT 'denorm-tenantId Phase 2 applied — 4 children NOT NULL + 6 composite parent FKs in place' AS result;
