-- CreateEnum
CREATE TYPE "TestMethod" AS ENUM ('MANUAL', 'AUTOMATED');

-- CreateEnum
CREATE TYPE "TestPlanStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "TestRunStatus" AS ENUM ('PLANNED', 'RUNNING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TestResult" AS ENUM ('PASS', 'FAIL', 'INCONCLUSIVE');

-- CreateEnum
CREATE TYPE "TestEvidenceKind" AS ENUM ('FILE', 'EVIDENCE', 'LINK', 'INTEGRATION_RESULT');

-- CreateTable
CREATE TABLE "ControlTestPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "method" "TestMethod" NOT NULL DEFAULT 'MANUAL',
    "frequency" "ControlFrequency" NOT NULL DEFAULT 'AD_HOC',
    "nextDueAt" TIMESTAMP(3),
    "ownerUserId" TEXT,
    "expectedEvidence" JSONB,
    "status" "TestPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControlTestPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlTestRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "testPlanId" TEXT NOT NULL,
    "status" "TestRunStatus" NOT NULL DEFAULT 'PLANNED',
    "result" "TestResult",
    "executedAt" TIMESTAMP(3),
    "executedByUserId" TEXT,
    "notes" TEXT,
    "findingSummary" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControlTestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlTestEvidenceLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "testRunId" TEXT NOT NULL,
    "kind" "TestEvidenceKind" NOT NULL,
    "fileId" TEXT,
    "evidenceId" TEXT,
    "url" TEXT,
    "integrationResultId" TEXT,
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControlTestEvidenceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlTestStep" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "testPlanId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "instruction" TEXT NOT NULL,
    "expectedOutput" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControlTestStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ControlTestPlan_tenantId_idx" ON "ControlTestPlan"("tenantId");

-- CreateIndex
CREATE INDEX "ControlTestPlan_tenantId_controlId_idx" ON "ControlTestPlan"("tenantId", "controlId");

-- CreateIndex
CREATE INDEX "ControlTestPlan_tenantId_nextDueAt_idx" ON "ControlTestPlan"("tenantId", "nextDueAt");

-- CreateIndex
CREATE INDEX "ControlTestPlan_tenantId_status_idx" ON "ControlTestPlan"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ControlTestRun_tenantId_idx" ON "ControlTestRun"("tenantId");

-- CreateIndex
CREATE INDEX "ControlTestRun_tenantId_testPlanId_idx" ON "ControlTestRun"("tenantId", "testPlanId");

-- CreateIndex
CREATE INDEX "ControlTestRun_tenantId_result_idx" ON "ControlTestRun"("tenantId", "result");

-- CreateIndex
CREATE INDEX "ControlTestRun_tenantId_executedAt_idx" ON "ControlTestRun"("tenantId", "executedAt");

-- CreateIndex
CREATE INDEX "ControlTestEvidenceLink_tenantId_idx" ON "ControlTestEvidenceLink"("tenantId");

-- CreateIndex
CREATE INDEX "ControlTestEvidenceLink_tenantId_testRunId_idx" ON "ControlTestEvidenceLink"("tenantId", "testRunId");

-- CreateIndex
CREATE UNIQUE INDEX "ControlTestEvidenceLink_testRunId_kind_evidenceId_key" ON "ControlTestEvidenceLink"("testRunId", "kind", "evidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "ControlTestEvidenceLink_testRunId_kind_fileId_key" ON "ControlTestEvidenceLink"("testRunId", "kind", "fileId");

-- CreateIndex
CREATE INDEX "ControlTestStep_tenantId_testPlanId_idx" ON "ControlTestStep"("tenantId", "testPlanId");

-- AddForeignKey
ALTER TABLE "ControlTestPlan" ADD CONSTRAINT "ControlTestPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTestPlan" ADD CONSTRAINT "ControlTestPlan_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "Control"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTestPlan" ADD CONSTRAINT "ControlTestPlan_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTestPlan" ADD CONSTRAINT "ControlTestPlan_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTestRun" ADD CONSTRAINT "ControlTestRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTestRun" ADD CONSTRAINT "ControlTestRun_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "Control"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTestRun" ADD CONSTRAINT "ControlTestRun_testPlanId_fkey" FOREIGN KEY ("testPlanId") REFERENCES "ControlTestPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTestRun" ADD CONSTRAINT "ControlTestRun_executedByUserId_fkey" FOREIGN KEY ("executedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTestRun" ADD CONSTRAINT "ControlTestRun_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTestEvidenceLink" ADD CONSTRAINT "ControlTestEvidenceLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTestEvidenceLink" ADD CONSTRAINT "ControlTestEvidenceLink_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "ControlTestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTestEvidenceLink" ADD CONSTRAINT "ControlTestEvidenceLink_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTestEvidenceLink" ADD CONSTRAINT "ControlTestEvidenceLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTestStep" ADD CONSTRAINT "ControlTestStep_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTestStep" ADD CONSTRAINT "ControlTestStep_testPlanId_fkey" FOREIGN KEY ("testPlanId") REFERENCES "ControlTestPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
