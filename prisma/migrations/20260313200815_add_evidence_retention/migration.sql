-- CreateEnum
CREATE TYPE "RetentionPolicy" AS ENUM ('NONE', 'FIXED_DATE', 'DAYS_AFTER_UPLOAD');

-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "expiredAt" TIMESTAMP(3),
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "retentionDays" INTEGER,
ADD COLUMN     "retentionPolicy" "RetentionPolicy" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "retentionUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Evidence_tenantId_retentionUntil_idx" ON "Evidence"("tenantId", "retentionUntil");

-- CreateIndex
CREATE INDEX "Evidence_tenantId_isArchived_idx" ON "Evidence"("tenantId", "isArchived");
