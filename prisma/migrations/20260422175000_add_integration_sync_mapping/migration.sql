-- ═══════════════════════════════════════════════════════════════════
-- IntegrationSyncMapping — local↔remote entity graph for the sync
-- orchestrator (introduced by `feat(integrations): add sync orchestrator
-- with conflict detection + resolution`).
--
-- The model was added to `prisma/schema.prisma` without a paired
-- migration, so dev DBs picked it up via `prisma db push` while CI
-- (which runs `prisma migrate deploy`) had no CREATE TABLE for it.
-- The downstream migration `20260422180000_enable_rls_coverage` then
-- failed with `relation "IntegrationSyncMapping" does not exist`.
--
-- This migration is dated `20260422175000` so it runs immediately
-- before the RLS-coverage migration that depends on it. It is a pure
-- additive migration (no data backfill, no destructive change), safe
-- to apply on any environment that already has the table from
-- `db push` — in that case the `IF NOT EXISTS` guards make it a
-- no-op for the table itself, and Prisma's migrate deploy records
-- the migration as applied.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Enums ─────────────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SYNCED', 'CONFLICT', 'FAILED', 'STALE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "SyncDirection" AS ENUM ('PUSH', 'PULL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "ConflictStrategy" AS ENUM ('REMOTE_WINS', 'LOCAL_WINS', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── Table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "IntegrationSyncMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "connectionId" TEXT,
    "localEntityType" TEXT NOT NULL,
    "localEntityId" TEXT NOT NULL,
    "remoteEntityType" TEXT NOT NULL,
    "remoteEntityId" TEXT NOT NULL,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "lastSyncDirection" "SyncDirection",
    "conflictStrategy" "ConflictStrategy" NOT NULL DEFAULT 'REMOTE_WINS',
    "localUpdatedAt" TIMESTAMP(3),
    "remoteUpdatedAt" TIMESTAMP(3),
    "remoteDataJson" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "errorMessage" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationSyncMapping_pkey" PRIMARY KEY ("id")
);

-- ─── Indexes & uniqueness ──────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationSyncMapping_tenantId_provider_localEntityType_lo_key"
    ON "IntegrationSyncMapping" ("tenantId", "provider", "localEntityType", "localEntityId");

CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationSyncMapping_tenantId_provider_remoteEntityType_r_key"
    ON "IntegrationSyncMapping" ("tenantId", "provider", "remoteEntityType", "remoteEntityId");

CREATE INDEX IF NOT EXISTS "IntegrationSyncMapping_tenantId_provider_idx"
    ON "IntegrationSyncMapping" ("tenantId", "provider");

CREATE INDEX IF NOT EXISTS "IntegrationSyncMapping_tenantId_syncStatus_idx"
    ON "IntegrationSyncMapping" ("tenantId", "syncStatus");

CREATE INDEX IF NOT EXISTS "IntegrationSyncMapping_connectionId_idx"
    ON "IntegrationSyncMapping" ("connectionId");

-- ─── Foreign keys ──────────────────────────────────────────────────
-- Wrapped in DO blocks so re-running on a `db push`-seeded DB that
-- already has the constraints is a no-op rather than a hard error.

DO $$ BEGIN
    ALTER TABLE "IntegrationSyncMapping"
        ADD CONSTRAINT "IntegrationSyncMapping_connectionId_fkey"
        FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "IntegrationSyncMapping"
        ADD CONSTRAINT "IntegrationSyncMapping_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
