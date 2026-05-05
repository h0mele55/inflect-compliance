-- Epic G-2 — Control Test Automation Scheduling (schema foundation)
--
-- Adds the AutomationType enum and six new fields on ControlTestPlan
-- so test plans can carry a cron schedule + scheduler bookkeeping.
-- All new fields are nullable or default to MANUAL/null, so existing
-- manual plans remain valid and observationally identical.
--
-- Indexes:
--   (tenantId, nextRunAt)              — due-run scan
--   (tenantId, automationType, status) — fan-out filter for scheduled plans

-- CreateEnum
CREATE TYPE "AutomationType" AS ENUM ('MANUAL', 'SCRIPT', 'INTEGRATION');

-- AlterTable
ALTER TABLE "ControlTestPlan" ADD COLUMN     "automationConfig" JSONB,
ADD COLUMN     "automationType" "AutomationType" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "lastScheduledRunAt" TIMESTAMP(3),
ADD COLUMN     "nextRunAt" TIMESTAMP(3),
ADD COLUMN     "schedule" TEXT,
ADD COLUMN     "scheduleTimezone" TEXT;

-- CreateIndex
CREATE INDEX "ControlTestPlan_tenantId_nextRunAt_idx" ON "ControlTestPlan"("tenantId", "nextRunAt");

-- CreateIndex
CREATE INDEX "ControlTestPlan_tenantId_automationType_status_idx" ON "ControlTestPlan"("tenantId", "automationType", "status");
