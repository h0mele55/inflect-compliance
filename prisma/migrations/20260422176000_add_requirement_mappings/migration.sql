-- ═══════════════════════════════════════════════════════════════════
-- RequirementMappingSet + RequirementMapping — cross-framework
-- traceability graph (introduced by `7a1067c feat: complete editable
-- lifecycle hardening (GAP-1..5, CQ-1, CQ-3)`).
--
-- The two models were added to `prisma/schema.prisma` without a paired
-- migration, so dev DBs picked them up via `prisma db push` while CI
-- (which runs `prisma migrate deploy`) had no CREATE TABLE for them.
--
-- Same fix shape as `20260422175000_add_integration_sync_mapping`:
-- pure additive, idempotent guards (`IF NOT EXISTS`,
-- `EXCEPTION WHEN duplicate_object`) so re-applying on a `db push`-
-- seeded DB is a no-op.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Enum ──────────────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE "MappingStrength" AS ENUM ('EQUAL', 'SUPERSET', 'SUBSET', 'INTERSECT', 'RELATED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── Tables ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "RequirementMappingSet" (
    "id" TEXT NOT NULL,
    "sourceFrameworkId" TEXT NOT NULL,
    "targetFrameworkId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sourceUrn" TEXT,
    "contentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequirementMappingSet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RequirementMapping" (
    "id" TEXT NOT NULL,
    "mappingSetId" TEXT NOT NULL,
    "sourceRequirementId" TEXT NOT NULL,
    "targetRequirementId" TEXT NOT NULL,
    "strength" "MappingStrength" NOT NULL DEFAULT 'RELATED',
    "rationale" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequirementMapping_pkey" PRIMARY KEY ("id")
);

-- ─── Indexes & uniqueness ──────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "RequirementMappingSet_sourceFrameworkId_idx"
    ON "RequirementMappingSet"("sourceFrameworkId");

CREATE INDEX IF NOT EXISTS "RequirementMappingSet_targetFrameworkId_idx"
    ON "RequirementMappingSet"("targetFrameworkId");

CREATE UNIQUE INDEX IF NOT EXISTS "RequirementMappingSet_sourceFrameworkId_targetFrameworkId_key"
    ON "RequirementMappingSet"("sourceFrameworkId", "targetFrameworkId");

CREATE INDEX IF NOT EXISTS "RequirementMapping_sourceRequirementId_idx"
    ON "RequirementMapping"("sourceRequirementId");

CREATE INDEX IF NOT EXISTS "RequirementMapping_targetRequirementId_idx"
    ON "RequirementMapping"("targetRequirementId");

CREATE INDEX IF NOT EXISTS "RequirementMapping_mappingSetId_idx"
    ON "RequirementMapping"("mappingSetId");

CREATE UNIQUE INDEX IF NOT EXISTS "RequirementMapping_mappingSetId_sourceRequirementId_targetR_key"
    ON "RequirementMapping"("mappingSetId", "sourceRequirementId", "targetRequirementId");

-- ─── Foreign keys ──────────────────────────────────────────────────

DO $$ BEGIN
    ALTER TABLE "RequirementMappingSet"
        ADD CONSTRAINT "RequirementMappingSet_sourceFrameworkId_fkey"
        FOREIGN KEY ("sourceFrameworkId") REFERENCES "Framework"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "RequirementMappingSet"
        ADD CONSTRAINT "RequirementMappingSet_targetFrameworkId_fkey"
        FOREIGN KEY ("targetFrameworkId") REFERENCES "Framework"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "RequirementMapping"
        ADD CONSTRAINT "RequirementMapping_mappingSetId_fkey"
        FOREIGN KEY ("mappingSetId") REFERENCES "RequirementMappingSet"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "RequirementMapping"
        ADD CONSTRAINT "RequirementMapping_sourceRequirementId_fkey"
        FOREIGN KEY ("sourceRequirementId") REFERENCES "FrameworkRequirement"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "RequirementMapping"
        ADD CONSTRAINT "RequirementMapping_targetRequirementId_fkey"
        FOREIGN KEY ("targetRequirementId") REFERENCES "FrameworkRequirement"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
