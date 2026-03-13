/*
  Warnings:

  - You are about to drop the `_legacy_Issue` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_legacy_IssueComment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_legacy_IssueEvidenceBundle` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_legacy_IssueEvidenceBundleItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_legacy_IssueLink` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_legacy_IssueWatcher` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_legacy_Task` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT;

-- AlterTable
ALTER TABLE "Control" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT;

-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT;

-- AlterTable
ALTER TABLE "Policy" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT;

-- AlterTable
ALTER TABLE "Risk" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT;

-- AlterTable
ALTER TABLE "Task" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TaskComment" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DropTable
DROP TABLE "_legacy_Issue";

-- DropTable
DROP TABLE "_legacy_IssueComment";

-- DropTable
DROP TABLE "_legacy_IssueEvidenceBundle";

-- DropTable
DROP TABLE "_legacy_IssueEvidenceBundleItem";

-- DropTable
DROP TABLE "_legacy_IssueLink";

-- DropTable
DROP TABLE "_legacy_IssueWatcher";

-- DropTable
DROP TABLE "_legacy_Task";

-- DropEnum
DROP TYPE "BundleItemType";

-- DropEnum
DROP TYPE "ControlGapType";

-- DropEnum
DROP TYPE "FindingSource";

-- DropEnum
DROP TYPE "IssueLinkEntityType";

-- DropEnum
DROP TYPE "IssueLinkRelation";

-- DropEnum
DROP TYPE "IssuePriority";

-- DropEnum
DROP TYPE "IssueSeverity";

-- DropEnum
DROP TYPE "IssueStatus";

-- DropEnum
DROP TYPE "IssueType";

-- DropEnum
DROP TYPE "TaskStatus";

-- CreateIndex
CREATE INDEX "Asset_tenantId_deletedAt_idx" ON "Asset"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "Control_tenantId_deletedAt_idx" ON "Control"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "Evidence_tenantId_deletedAt_idx" ON "Evidence"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "Policy_tenantId_deletedAt_idx" ON "Policy"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "Risk_tenantId_deletedAt_idx" ON "Risk"("tenantId", "deletedAt");
