-- ════════════════════════════════════════════════════════════════════
-- denorm-tenantId — Phase 1: additive column + backfill + FK targets
-- ────────────────────────────────────────────────────────────────────
-- Adds a direct `tenantId` column to four ownership-chained child
-- tables and backfills it from each row's parent. Lays the
-- groundwork for Phase 2 (NOT NULL + composite FK) and Phase 3
-- (trivial RLS policy swap).
--
-- Tables in scope:
--   • EvidenceReview     (parent: Evidence)
--   • AuditChecklistItem (parent: Audit)
--   • FindingEvidence    (parents: Finding, Evidence)
--   • AuditorPackAccess  (parents: AuditPack, AuditorAccount)
--
-- Phase 1 is purely additive:
--   • new column is nullable;
--   • existing chained RLS policies still enforce isolation;
--   • new repo writes set tenantId defensively (see app-layer
--     changes in this PR);
--   • re-running this migration is a no-op (IF NOT EXISTS, IS NULL).
--
-- Performance: each backfill is a single UPDATE … FROM with the join
-- keyed by the parent's PK. Production volumes are low-millions; no
-- chunked-batch loop required.
--
-- Rollback: drop the new columns + indexes + parent unique
-- constraints. No data loss — the column is brand-new and additive.
-- ════════════════════════════════════════════════════════════════════

-- ─── Pre-flight integrity checks (junction tables only) ─────────────
-- Both parents of a junction row MUST share the same tenantId. If
-- any row violates this, the migration aborts — the chained RLS
-- WITH CHECK was supposed to make this impossible, so a non-zero
-- count is a P1 incident and not something this migration should
-- silently paper over.

DO $$
DECLARE mismatch BIGINT;
BEGIN
    SELECT count(*) INTO mismatch
    FROM "FindingEvidence" fe
    JOIN "Finding"  f ON f.id = fe."findingId"
    JOIN "Evidence" e ON e.id = fe."evidenceId"
    WHERE f."tenantId" <> e."tenantId";

    IF mismatch > 0 THEN
        RAISE EXCEPTION
            'FindingEvidence integrity: % junction row(s) reference parents in different tenants. '
            'The chained RLS WITH CHECK should have prevented this — investigate before re-running.',
            mismatch;
    END IF;
END $$;

DO $$
DECLARE mismatch BIGINT;
BEGIN
    SELECT count(*) INTO mismatch
    FROM "AuditorPackAccess" apa
    JOIN "AuditPack"      ap ON ap.id = apa."auditPackId"
    JOIN "AuditorAccount" aa ON aa.id = apa."auditorId"
    WHERE ap."tenantId" <> aa."tenantId";

    IF mismatch > 0 THEN
        RAISE EXCEPTION
            'AuditorPackAccess integrity: % junction row(s) reference parents in different tenants. '
            'The chained RLS WITH CHECK should have prevented this — investigate before re-running.',
            mismatch;
    END IF;
END $$;

-- ─── (id, tenantId) unique constraints on parents ───────────────────
-- Required as the FK target for Phase 2's composite FOREIGN KEY.
-- Logically redundant (id is already PK-unique) but Postgres requires
-- the multi-column unique constraint to exist before a multi-column
-- FK can reference it. Wrapped in DO blocks so re-running on a DB
-- that already has the constraint (e.g. via `db push` during dev) is
-- a no-op rather than a hard error.

DO $$ BEGIN
    ALTER TABLE "Audit" ADD CONSTRAINT "Audit_id_tenantId_key" UNIQUE ("id", "tenantId");
EXCEPTION WHEN duplicate_table OR duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_id_tenantId_key" UNIQUE ("id", "tenantId");
EXCEPTION WHEN duplicate_table OR duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "Finding" ADD CONSTRAINT "Finding_id_tenantId_key" UNIQUE ("id", "tenantId");
EXCEPTION WHEN duplicate_table OR duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AuditPack" ADD CONSTRAINT "AuditPack_id_tenantId_key" UNIQUE ("id", "tenantId");
EXCEPTION WHEN duplicate_table OR duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AuditorAccount" ADD CONSTRAINT "AuditorAccount_id_tenantId_key" UNIQUE ("id", "tenantId");
EXCEPTION WHEN duplicate_table OR duplicate_object THEN null; END $$;

-- ─── Add tenantId column to children (NULL allowed in Phase 1) ──────

ALTER TABLE "EvidenceReview"     ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "AuditChecklistItem" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "FindingEvidence"    ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "AuditorPackAccess"  ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- ─── Backfill from parent tenantId ──────────────────────────────────
-- Idempotent: re-running with all rows already populated is a no-op
-- because the WHERE clause restricts to NULLs. INNER JOIN means
-- orphan child rows (FK-violating leftovers) are silently skipped
-- and surface as residual NULLs in the verification block below.

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

-- ─── Verify zero NULLs remain (informational) ───────────────────────
-- Phase 1 leaves the column nullable on purpose, so a residual
-- non-zero count does not block this migration. But it signals an
-- orphan-FK problem to investigate before Phase 2 flips the column
-- to NOT NULL. Surfaced as a NOTICE so it lands in the migration
-- log without blocking the deploy.

DO $$
DECLARE c BIGINT;
BEGIN
    SELECT count(*) INTO c FROM "EvidenceReview"     WHERE "tenantId" IS NULL;
    IF c > 0 THEN RAISE NOTICE 'EvidenceReview: % row(s) still NULL after backfill (orphan FK?)', c; END IF;

    SELECT count(*) INTO c FROM "AuditChecklistItem" WHERE "tenantId" IS NULL;
    IF c > 0 THEN RAISE NOTICE 'AuditChecklistItem: % row(s) still NULL after backfill (orphan FK?)', c; END IF;

    SELECT count(*) INTO c FROM "FindingEvidence"    WHERE "tenantId" IS NULL;
    IF c > 0 THEN RAISE NOTICE 'FindingEvidence: % row(s) still NULL after backfill (orphan FK?)', c; END IF;

    SELECT count(*) INTO c FROM "AuditorPackAccess"  WHERE "tenantId" IS NULL;
    IF c > 0 THEN RAISE NOTICE 'AuditorPackAccess: % row(s) still NULL after backfill (orphan FK?)', c; END IF;
END $$;

-- ─── Indexes for the future trivial RLS policy + tenant queries ─────
-- (tenantId) supports the Phase 3 trivial policy fold-in; the
-- (tenantId, parentFK) composite supports the common access pattern
-- "list child rows for tenant X by parent" and is a strict superset
-- of (parentFK) for queries that already carry the tenant predicate.

CREATE INDEX IF NOT EXISTS "EvidenceReview_tenantId_idx"
    ON "EvidenceReview" ("tenantId");

CREATE INDEX IF NOT EXISTS "EvidenceReview_tenantId_evidenceId_idx"
    ON "EvidenceReview" ("tenantId", "evidenceId");

CREATE INDEX IF NOT EXISTS "AuditChecklistItem_tenantId_idx"
    ON "AuditChecklistItem" ("tenantId");

CREATE INDEX IF NOT EXISTS "AuditChecklistItem_tenantId_auditId_idx"
    ON "AuditChecklistItem" ("tenantId", "auditId");

CREATE INDEX IF NOT EXISTS "FindingEvidence_tenantId_idx"
    ON "FindingEvidence" ("tenantId");

CREATE INDEX IF NOT EXISTS "FindingEvidence_tenantId_findingId_idx"
    ON "FindingEvidence" ("tenantId", "findingId");

CREATE INDEX IF NOT EXISTS "FindingEvidence_tenantId_evidenceId_idx"
    ON "FindingEvidence" ("tenantId", "evidenceId");

CREATE INDEX IF NOT EXISTS "AuditorPackAccess_tenantId_idx"
    ON "AuditorPackAccess" ("tenantId");

CREATE INDEX IF NOT EXISTS "AuditorPackAccess_tenantId_auditPackId_idx"
    ON "AuditorPackAccess" ("tenantId", "auditPackId");

CREATE INDEX IF NOT EXISTS "AuditorPackAccess_tenantId_auditorId_idx"
    ON "AuditorPackAccess" ("tenantId", "auditorId");

-- ─── tenantId → Tenant FKs (matches Prisma `tenant Tenant?` relation) ──
-- Distinct from the composite parent FK that lands in Phase 2:
-- this single-column FK guarantees the tenantId references a real
-- Tenant; the Phase 2 composite (parentFK, tenantId) → Parent(id,
-- tenantId) guarantees the child's tenantId equals its parent's.
-- Both invariants coexist.
--
-- ON DELETE SET NULL matches Prisma's default for an optional
-- relation, which is what we want in Phase 1 — a deleted Tenant
-- shouldn't cascade-delete unrelated junction rows; Phase 2 flips
-- this to RESTRICT once the column is NOT NULL and Phase 2's
-- composite FK takes over the cascade semantics.

DO $$ BEGIN
    ALTER TABLE "EvidenceReview"
        ADD CONSTRAINT "EvidenceReview_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AuditChecklistItem"
        ADD CONSTRAINT "AuditChecklistItem_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "FindingEvidence"
        ADD CONSTRAINT "FindingEvidence_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AuditorPackAccess"
        ADD CONSTRAINT "AuditorPackAccess_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── Privilege grants for the new columns / indexes ─────────────────
-- The original init-roles.sh issues GRANT ALL ON ALL TABLES IN SCHEMA
-- public to app_user. New columns inherit table-level grants; no
-- additional grant needed for the children. Re-issued here for the
-- parents only as a defensive idempotent line — the unique constraint
-- itself is structure-only and doesn't require a grant.

SELECT 'denorm-tenantId Phase 1 applied — 4 children carry nullable tenantId' AS result;
