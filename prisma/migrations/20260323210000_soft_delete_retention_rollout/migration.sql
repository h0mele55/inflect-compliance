-- Soft-Delete & Retention Rollout (Epic 8: Data Protection)
-- Adds deletedAt, deletedByUserId to gap models
-- Adds retentionUntil to all critical business entities

-- ─── Task ───
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "deletedByUserId" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "retentionUntil" TIMESTAMP;
CREATE INDEX IF NOT EXISTS "Task_tenantId_deletedAt_idx" ON "Task"("tenantId", "deletedAt");

-- ─── FileRecord ───
ALTER TABLE "FileRecord" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP;
ALTER TABLE "FileRecord" ADD COLUMN IF NOT EXISTS "deletedByUserId" TEXT;
ALTER TABLE "FileRecord" ADD COLUMN IF NOT EXISTS "retentionUntil" TIMESTAMP;
CREATE INDEX IF NOT EXISTS "FileRecord_tenantId_deletedAt_idx" ON "FileRecord"("tenantId", "deletedAt");

-- ─── Vendor ───
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "deletedByUserId" TEXT;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "retentionUntil" TIMESTAMP;
CREATE INDEX IF NOT EXISTS "Vendor_tenantId_deletedAt_idx" ON "Vendor"("tenantId", "deletedAt");

-- ─── Finding ───
ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP;
ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "deletedByUserId" TEXT;
CREATE INDEX IF NOT EXISTS "Finding_tenantId_deletedAt_idx" ON "Finding"("tenantId", "deletedAt");

-- ─── Audit ───
ALTER TABLE "Audit" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP;
ALTER TABLE "Audit" ADD COLUMN IF NOT EXISTS "deletedByUserId" TEXT;
CREATE INDEX IF NOT EXISTS "Audit_tenantId_deletedAt_idx" ON "Audit"("tenantId", "deletedAt");

-- ─── AuditCycle ───
ALTER TABLE "AuditCycle" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP;
ALTER TABLE "AuditCycle" ADD COLUMN IF NOT EXISTS "deletedByUserId" TEXT;
CREATE INDEX IF NOT EXISTS "AuditCycle_tenantId_deletedAt_idx" ON "AuditCycle"("tenantId", "deletedAt");

-- ─── AuditPack ───
ALTER TABLE "AuditPack" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP;
ALTER TABLE "AuditPack" ADD COLUMN IF NOT EXISTS "deletedByUserId" TEXT;
CREATE INDEX IF NOT EXISTS "AuditPack_tenantId_deletedAt_idx" ON "AuditPack"("tenantId", "deletedAt");

-- ─── retentionUntil for existing P0 models ───
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "retentionUntil" TIMESTAMP;
ALTER TABLE "Risk" ADD COLUMN IF NOT EXISTS "retentionUntil" TIMESTAMP;
ALTER TABLE "Control" ADD COLUMN IF NOT EXISTS "retentionUntil" TIMESTAMP;
ALTER TABLE "Policy" ADD COLUMN IF NOT EXISTS "retentionUntil" TIMESTAMP;
