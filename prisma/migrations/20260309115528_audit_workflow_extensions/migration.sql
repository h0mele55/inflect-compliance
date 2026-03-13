-- CreateEnum
CREATE TYPE "FindingSource" AS ENUM ('INTERNAL', 'EXTERNAL_AUDITOR', 'PEN_TEST', 'INCIDENT');

-- CreateEnum
CREATE TYPE "ControlGapType" AS ENUM ('DESIGN', 'OPERATING_EFFECTIVENESS', 'DOCUMENTATION');

-- CreateEnum
CREATE TYPE "BundleItemType" AS ENUM ('FILE', 'EVIDENCE', 'INTEGRATION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IssueStatus" ADD VALUE 'REMEDIATION_IN_PROGRESS';
ALTER TYPE "IssueStatus" ADD VALUE 'READY_FOR_RETEST';

-- DropIndex
DROP INDEX "ControlAsset_controlId_assetId_key";

-- DropIndex
DROP INDEX "RiskControl_riskId_controlId_key";

-- AlterTable
ALTER TABLE "Framework" ALTER COLUMN "name" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "controlGapType" "ControlGapType",
ADD COLUMN     "findingSource" "FindingSource",
ADD COLUMN     "remediationDueAt" TIMESTAMP(3),
ADD COLUMN     "remediationOwnerUserId" TEXT,
ADD COLUMN     "remediationPlan" TEXT;

-- CreateTable
CREATE TABLE "IssueEvidenceBundle" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "frozenAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueEvidenceBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueEvidenceBundleItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "entityType" "BundleItemType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "label" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueEvidenceBundleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IssueEvidenceBundle_tenantId_issueId_idx" ON "IssueEvidenceBundle"("tenantId", "issueId");

-- CreateIndex
CREATE INDEX "IssueEvidenceBundleItem_tenantId_bundleId_idx" ON "IssueEvidenceBundleItem"("tenantId", "bundleId");

-- CreateIndex
CREATE UNIQUE INDEX "IssueEvidenceBundleItem_bundleId_entityType_entityId_key" ON "IssueEvidenceBundleItem"("bundleId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_remediationOwnerUserId_fkey" FOREIGN KEY ("remediationOwnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueEvidenceBundle" ADD CONSTRAINT "IssueEvidenceBundle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueEvidenceBundle" ADD CONSTRAINT "IssueEvidenceBundle_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueEvidenceBundle" ADD CONSTRAINT "IssueEvidenceBundle_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueEvidenceBundleItem" ADD CONSTRAINT "IssueEvidenceBundleItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueEvidenceBundleItem" ADD CONSTRAINT "IssueEvidenceBundleItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "IssueEvidenceBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueEvidenceBundleItem" ADD CONSTRAINT "IssueEvidenceBundleItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "Framework_name_key" RENAME TO "Framework_key_key";
