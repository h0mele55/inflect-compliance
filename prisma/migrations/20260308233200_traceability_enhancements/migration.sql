-- Enums
CREATE TYPE "Criticality" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'RETIRED');
CREATE TYPE "CoverageType" AS ENUM ('FULL', 'PARTIAL', 'UNKNOWN');
CREATE TYPE "ExposureLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- Add new AssetType variants
ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'APPLICATION';
ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'INFRASTRUCTURE';
ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'PROCESS';
ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'OTHER';

-- ─── Asset enhancements ───
ALTER TABLE "Asset" ADD COLUMN "ownerUserId" TEXT;
ALTER TABLE "Asset" ADD COLUMN "criticality" "Criticality";
ALTER TABLE "Asset" ADD COLUMN "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Asset" ADD COLUMN "externalRef" TEXT;
ALTER TABLE "Asset" ADD COLUMN "tags" TEXT;

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Asset unique + indexes
CREATE UNIQUE INDEX IF NOT EXISTS "Asset_tenantId_name_key" ON "Asset"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "Asset_tenantId_type_idx" ON "Asset"("tenantId", "type");
CREATE INDEX IF NOT EXISTS "Asset_tenantId_criticality_idx" ON "Asset"("tenantId", "criticality");
CREATE INDEX IF NOT EXISTS "Asset_tenantId_status_idx" ON "Asset"("tenantId", "status");

-- ─── RiskControl enhancements ───
-- Drop old unique constraint
ALTER TABLE "RiskControl" DROP CONSTRAINT IF EXISTS "RiskControl_riskId_controlId_key";

-- Add new columns
ALTER TABLE "RiskControl" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "RiskControl" ADD COLUMN "rationale" TEXT;
ALTER TABLE "RiskControl" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "RiskControl" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill tenantId from the Risk table
UPDATE "RiskControl" SET "tenantId" = r."tenantId" FROM "Risk" r WHERE "RiskControl"."riskId" = r."id";

-- Make tenantId NOT NULL after backfill
ALTER TABLE "RiskControl" ALTER COLUMN "tenantId" SET NOT NULL;

-- Add foreign keys and constraints
ALTER TABLE "RiskControl" ADD CONSTRAINT "RiskControl_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RiskControl" ADD CONSTRAINT "RiskControl_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "RiskControl_tenantId_riskId_controlId_key" ON "RiskControl"("tenantId", "riskId", "controlId");
CREATE INDEX "RiskControl_tenantId_idx" ON "RiskControl"("tenantId");

-- ─── ControlAsset enhancements ───
ALTER TABLE "ControlAsset" DROP CONSTRAINT IF EXISTS "ControlAsset_controlId_assetId_key";

ALTER TABLE "ControlAsset" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "ControlAsset" ADD COLUMN "coverageType" "CoverageType" NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "ControlAsset" ADD COLUMN "rationale" TEXT;
ALTER TABLE "ControlAsset" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "ControlAsset" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill tenantId from the Asset table
UPDATE "ControlAsset" SET "tenantId" = a."tenantId" FROM "Asset" a WHERE "ControlAsset"."assetId" = a."id";

-- Make tenantId NOT NULL after backfill (handle case where there are no rows)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ControlAsset" WHERE "tenantId" IS NULL) THEN
    DELETE FROM "ControlAsset" WHERE "tenantId" IS NULL;
  END IF;
END
$$;
ALTER TABLE "ControlAsset" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "ControlAsset" ADD CONSTRAINT "ControlAsset_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ControlAsset" ADD CONSTRAINT "ControlAsset_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ControlAsset_tenantId_controlId_assetId_key" ON "ControlAsset"("tenantId", "controlId", "assetId");
CREATE INDEX "ControlAsset_tenantId_idx" ON "ControlAsset"("tenantId");

-- ─── AssetRiskLink (new table) ───
CREATE TABLE "AssetRiskLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "exposureLevel" "ExposureLevel" NOT NULL DEFAULT 'MEDIUM',
    "rationale" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetRiskLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssetRiskLink_tenantId_assetId_riskId_key" ON "AssetRiskLink"("tenantId", "assetId", "riskId");
CREATE INDEX "AssetRiskLink_tenantId_idx" ON "AssetRiskLink"("tenantId");

ALTER TABLE "AssetRiskLink" ADD CONSTRAINT "AssetRiskLink_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetRiskLink" ADD CONSTRAINT "AssetRiskLink_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetRiskLink" ADD CONSTRAINT "AssetRiskLink_riskId_fkey"
    FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetRiskLink" ADD CONSTRAINT "AssetRiskLink_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
