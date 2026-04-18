-- CreateTable
CREATE TABLE "ComplianceSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,

    -- Control Coverage
    "controlsTotal" INTEGER NOT NULL DEFAULT 0,
    "controlsApplicable" INTEGER NOT NULL DEFAULT 0,
    "controlsImplemented" INTEGER NOT NULL DEFAULT 0,
    "controlsInProgress" INTEGER NOT NULL DEFAULT 0,
    "controlsNotStarted" INTEGER NOT NULL DEFAULT 0,
    "controlCoverageBps" INTEGER NOT NULL DEFAULT 0,

    -- Risks
    "risksTotal" INTEGER NOT NULL DEFAULT 0,
    "risksOpen" INTEGER NOT NULL DEFAULT 0,
    "risksMitigating" INTEGER NOT NULL DEFAULT 0,
    "risksAccepted" INTEGER NOT NULL DEFAULT 0,
    "risksClosed" INTEGER NOT NULL DEFAULT 0,
    "risksLow" INTEGER NOT NULL DEFAULT 0,
    "risksMedium" INTEGER NOT NULL DEFAULT 0,
    "risksHigh" INTEGER NOT NULL DEFAULT 0,
    "risksCritical" INTEGER NOT NULL DEFAULT 0,

    -- Evidence
    "evidenceTotal" INTEGER NOT NULL DEFAULT 0,
    "evidenceOverdue" INTEGER NOT NULL DEFAULT 0,
    "evidenceDueSoon7d" INTEGER NOT NULL DEFAULT 0,
    "evidenceDueSoon30d" INTEGER NOT NULL DEFAULT 0,
    "evidenceCurrent" INTEGER NOT NULL DEFAULT 0,

    -- Policies
    "policiesTotal" INTEGER NOT NULL DEFAULT 0,
    "policiesPublished" INTEGER NOT NULL DEFAULT 0,
    "policiesOverdueReview" INTEGER NOT NULL DEFAULT 0,

    -- Tasks
    "tasksTotal" INTEGER NOT NULL DEFAULT 0,
    "tasksOpen" INTEGER NOT NULL DEFAULT 0,
    "tasksOverdue" INTEGER NOT NULL DEFAULT 0,

    -- Vendors
    "vendorsTotal" INTEGER NOT NULL DEFAULT 0,
    "vendorsOverdueReview" INTEGER NOT NULL DEFAULT 0,

    -- Findings
    "findingsOpen" INTEGER NOT NULL DEFAULT 0,

    -- Meta
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceSnapshot_tenantId_snapshotDate_key" ON "ComplianceSnapshot"("tenantId", "snapshotDate");

-- CreateIndex
CREATE INDEX "ComplianceSnapshot_tenantId_snapshotDate_idx" ON "ComplianceSnapshot"("tenantId", "snapshotDate");

-- CreateIndex
CREATE INDEX "ComplianceSnapshot_tenantId_idx" ON "ComplianceSnapshot"("tenantId");

-- AddForeignKey
ALTER TABLE "ComplianceSnapshot" ADD CONSTRAINT "ComplianceSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
