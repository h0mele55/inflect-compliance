-- CreateEnum
CREATE TYPE "IssueType" AS ENUM ('AUDIT_FINDING', 'CONTROL_GAP', 'INCIDENT', 'IMPROVEMENT', 'TASK');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IssuePriority" AS ENUM ('P0', 'P1', 'P2', 'P3');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'TRIAGED', 'IN_PROGRESS', 'BLOCKED', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "IssueLinkEntityType" AS ENUM ('CONTROL', 'RISK', 'ASSET', 'EVIDENCE', 'FILE');

-- CreateEnum
CREATE TYPE "IssueLinkRelation" AS ENUM ('RELATES_TO', 'CAUSED_BY', 'MITIGATED_BY', 'EVIDENCE_FOR');

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "IssueType" NOT NULL,
    "severity" "IssueSeverity" NOT NULL DEFAULT 'MEDIUM',
    "priority" "IssuePriority" NOT NULL DEFAULT 'P2',
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "dueAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "assigneeUserId" TEXT,
    "reporterUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "entityType" "IssueLinkEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "relation" "IssueLinkRelation" NOT NULL DEFAULT 'RELATES_TO',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueComment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IssueComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueWatcher" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "IssueWatcher_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Issue_tenantId_idx" ON "Issue"("tenantId");
CREATE INDEX "Issue_tenantId_status_idx" ON "Issue"("tenantId", "status");
CREATE INDEX "Issue_tenantId_severity_idx" ON "Issue"("tenantId", "severity");
CREATE INDEX "Issue_tenantId_assigneeUserId_idx" ON "Issue"("tenantId", "assigneeUserId");
CREATE INDEX "Issue_tenantId_dueAt_idx" ON "Issue"("tenantId", "dueAt");
CREATE INDEX "Issue_tenantId_type_idx" ON "Issue"("tenantId", "type");
CREATE UNIQUE INDEX "Issue_tenantId_key_key" ON "Issue"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "IssueLink_tenantId_issueId_entityType_entityId_key" ON "IssueLink"("tenantId", "issueId", "entityType", "entityId");
CREATE INDEX "IssueLink_tenantId_issueId_idx" ON "IssueLink"("tenantId", "issueId");

-- CreateIndex
CREATE INDEX "IssueComment_tenantId_issueId_idx" ON "IssueComment"("tenantId", "issueId");

-- CreateIndex
CREATE UNIQUE INDEX "IssueWatcher_issueId_userId_key" ON "IssueWatcher"("issueId", "userId");
CREATE INDEX "IssueWatcher_tenantId_issueId_idx" ON "IssueWatcher"("tenantId", "issueId");

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueLink" ADD CONSTRAINT "IssueLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IssueLink" ADD CONSTRAINT "IssueLink_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IssueLink" ADD CONSTRAINT "IssueLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueComment" ADD CONSTRAINT "IssueComment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IssueComment" ADD CONSTRAINT "IssueComment_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IssueComment" ADD CONSTRAINT "IssueComment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueWatcher" ADD CONSTRAINT "IssueWatcher_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IssueWatcher" ADD CONSTRAINT "IssueWatcher_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IssueWatcher" ADD CONSTRAINT "IssueWatcher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enable RLS on new tables
ALTER TABLE "Issue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IssueLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IssueComment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IssueWatcher" ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Issue
CREATE POLICY "tenant_isolation" ON "Issue" USING ("tenantId" = current_setting('app.tenant_id', true));
CREATE POLICY "tenant_isolation" ON "IssueLink" USING ("tenantId" = current_setting('app.tenant_id', true));
CREATE POLICY "tenant_isolation" ON "IssueComment" USING ("tenantId" = current_setting('app.tenant_id', true));
CREATE POLICY "tenant_isolation" ON "IssueWatcher" USING ("tenantId" = current_setting('app.tenant_id', true));
