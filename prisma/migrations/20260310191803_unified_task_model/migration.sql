-- ═══════════════════════════════════════════════════════════════════
-- Migration: unified_task_model
-- Replaces old Task (simple TODO) + Issue (rich work item) with unified Task model.
-- Preserves old tables as _legacy_* for rollback safety.
-- ═══════════════════════════════════════════════════════════════════

-- Step 1: Create new enums
CREATE TYPE "WorkItemType" AS ENUM ('AUDIT_FINDING', 'CONTROL_GAP', 'INCIDENT', 'IMPROVEMENT', 'TASK');
CREATE TYPE "WorkItemSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "WorkItemPriority" AS ENUM ('P0', 'P1', 'P2', 'P3');
CREATE TYPE "WorkItemStatus" AS ENUM ('OPEN', 'TRIAGED', 'IN_PROGRESS', 'BLOCKED', 'RESOLVED', 'CLOSED', 'CANCELED');
CREATE TYPE "WorkItemSource" AS ENUM ('MANUAL', 'TEMPLATE', 'POLICY_REVIEW', 'AUDIT', 'INTEGRATION');
CREATE TYPE "TaskLinkEntityType" AS ENUM ('CONTROL', 'FRAMEWORK_REQUIREMENT', 'RISK', 'ASSET', 'POLICY', 'EVIDENCE', 'FILE', 'AUDIT_PACK', 'VENDOR');
CREATE TYPE "TaskLinkRelation" AS ENUM ('RELATES_TO', 'EVIDENCE_FOR', 'BLOCKED_BY', 'CAUSED_BY', 'MITIGATED_BY');

-- Step 2: Drop old Task indexes and FKs, then rename table
DROP INDEX IF EXISTS "Task_tenantId_idx";
ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_assigneeId_fkey";
ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_auditId_fkey";
ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_clauseId_fkey";
ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_findingId_fkey";
ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_controlId_fkey";
ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_tenantId_fkey";
ALTER TABLE "Task" RENAME CONSTRAINT "Task_pkey" TO "_legacy_Task_pkey";
ALTER TABLE "Task" RENAME TO "_legacy_Task";

-- Step 3: Rename old Issue tables to preserve data
-- Drop Issue indexes first
DROP INDEX IF EXISTS "Issue_tenantId_idx";
DROP INDEX IF EXISTS "Issue_tenantId_status_idx";
DROP INDEX IF EXISTS "Issue_tenantId_severity_idx";
DROP INDEX IF EXISTS "Issue_tenantId_assigneeUserId_idx";
DROP INDEX IF EXISTS "Issue_tenantId_dueAt_idx";
DROP INDEX IF EXISTS "Issue_tenantId_type_idx";
DROP INDEX IF EXISTS "Issue_tenantId_key_key";
DROP INDEX IF EXISTS "IssueLink_tenantId_issueId_idx";
DROP INDEX IF EXISTS "IssueLink_tenantId_issueId_entityType_entityId_key";
DROP INDEX IF EXISTS "IssueComment_tenantId_issueId_idx";
DROP INDEX IF EXISTS "IssueWatcher_tenantId_issueId_idx";
DROP INDEX IF EXISTS "IssueWatcher_issueId_userId_key";
DROP INDEX IF EXISTS "IssueEvidenceBundle_tenantId_issueId_idx";
DROP INDEX IF EXISTS "IssueEvidenceBundleItem_tenantId_bundleId_idx";
DROP INDEX IF EXISTS "IssueEvidenceBundleItem_bundleId_entityType_entityId_key";

-- Drop Issue FKs
ALTER TABLE "IssueEvidenceBundleItem" DROP CONSTRAINT IF EXISTS "IssueEvidenceBundleItem_bundleId_fkey";
ALTER TABLE "IssueEvidenceBundleItem" DROP CONSTRAINT IF EXISTS "IssueEvidenceBundleItem_createdByUserId_fkey";
ALTER TABLE "IssueEvidenceBundleItem" DROP CONSTRAINT IF EXISTS "IssueEvidenceBundleItem_tenantId_fkey";
ALTER TABLE "IssueEvidenceBundle" DROP CONSTRAINT IF EXISTS "IssueEvidenceBundle_createdByUserId_fkey";
ALTER TABLE "IssueEvidenceBundle" DROP CONSTRAINT IF EXISTS "IssueEvidenceBundle_issueId_fkey";
ALTER TABLE "IssueEvidenceBundle" DROP CONSTRAINT IF EXISTS "IssueEvidenceBundle_tenantId_fkey";
ALTER TABLE "IssueWatcher" DROP CONSTRAINT IF EXISTS "IssueWatcher_issueId_fkey";
ALTER TABLE "IssueWatcher" DROP CONSTRAINT IF EXISTS "IssueWatcher_tenantId_fkey";
ALTER TABLE "IssueWatcher" DROP CONSTRAINT IF EXISTS "IssueWatcher_userId_fkey";
ALTER TABLE "IssueComment" DROP CONSTRAINT IF EXISTS "IssueComment_createdByUserId_fkey";
ALTER TABLE "IssueComment" DROP CONSTRAINT IF EXISTS "IssueComment_issueId_fkey";
ALTER TABLE "IssueComment" DROP CONSTRAINT IF EXISTS "IssueComment_tenantId_fkey";
ALTER TABLE "IssueLink" DROP CONSTRAINT IF EXISTS "IssueLink_createdByUserId_fkey";
ALTER TABLE "IssueLink" DROP CONSTRAINT IF EXISTS "IssueLink_issueId_fkey";
ALTER TABLE "IssueLink" DROP CONSTRAINT IF EXISTS "IssueLink_tenantId_fkey";
ALTER TABLE "Issue" DROP CONSTRAINT IF EXISTS "Issue_assigneeUserId_fkey";
ALTER TABLE "Issue" DROP CONSTRAINT IF EXISTS "Issue_createdByUserId_fkey";
ALTER TABLE "Issue" DROP CONSTRAINT IF EXISTS "Issue_remediationOwnerUserId_fkey";
ALTER TABLE "Issue" DROP CONSTRAINT IF EXISTS "Issue_reporterUserId_fkey";
ALTER TABLE "Issue" DROP CONSTRAINT IF EXISTS "Issue_tenantId_fkey";

-- Rename tables
ALTER TABLE "IssueEvidenceBundleItem" RENAME TO "_legacy_IssueEvidenceBundleItem";
ALTER TABLE "IssueEvidenceBundle" RENAME TO "_legacy_IssueEvidenceBundle";
ALTER TABLE "IssueWatcher" RENAME TO "_legacy_IssueWatcher";
ALTER TABLE "IssueComment" RENAME TO "_legacy_IssueComment";
ALTER TABLE "IssueLink" RENAME TO "_legacy_IssueLink";
ALTER TABLE "Issue" RENAME TO "_legacy_Issue";

-- Step 4: Create new Task table (unified)
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "WorkItemType" NOT NULL DEFAULT 'TASK',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "WorkItemSeverity" NOT NULL DEFAULT 'MEDIUM',
    "priority" "WorkItemPriority" NOT NULL DEFAULT 'P2',
    "status" "WorkItemStatus" NOT NULL DEFAULT 'OPEN',
    "source" "WorkItemSource" DEFAULT 'MANUAL',
    "key" TEXT,
    "resolution" TEXT,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "assigneeUserId" TEXT,
    "reviewerUserId" TEXT,
    "controlId" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- Step 5: Create supporting tables
CREATE TABLE "TaskLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "entityType" "TaskLinkEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "relation" "TaskLinkRelation" NOT NULL DEFAULT 'RELATES_TO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskComment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskWatcher" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TaskWatcher_pkey" PRIMARY KEY ("id")
);

-- Step 6: Data migration — Issue → Task (preserving IDs)
INSERT INTO "Task" ("id", "tenantId", "type", "title", "description", "severity", "priority", "status", "source", "key", "resolution", "dueAt", "completedAt", "createdByUserId", "assigneeUserId", "controlId", "metadataJson", "createdAt", "updatedAt")
SELECT
    i."id",
    i."tenantId",
    -- Map IssueType → WorkItemType (same values)
    i."type"::text::"WorkItemType",
    i."title",
    i."description",
    -- Map IssueSeverity → WorkItemSeverity (same values)
    i."severity"::text::"WorkItemSeverity",
    -- Map IssuePriority → WorkItemPriority (same values)
    i."priority"::text::"WorkItemPriority",
    -- Map IssueStatus → WorkItemStatus (REMEDIATION_IN_PROGRESS/READY_FOR_RETEST → IN_PROGRESS)
    CASE
      WHEN i."status"::text IN ('REMEDIATION_IN_PROGRESS', 'READY_FOR_RETEST') THEN 'IN_PROGRESS'::"WorkItemStatus"
      ELSE i."status"::text::"WorkItemStatus"
    END,
    'MANUAL'::"WorkItemSource",
    -- Convert ISS- key to TSK- key
    CASE WHEN i."key" IS NOT NULL THEN REPLACE(i."key", 'ISS-', 'TSK-') ELSE NULL END,
    i."resolution",
    i."dueAt",
    i."resolvedAt",
    i."createdByUserId",
    i."assigneeUserId",
    NULL, -- controlId (not available directly on Issue)
    -- Store Issue-specific fields in metadataJson
    CASE WHEN i."findingSource" IS NOT NULL
              OR i."controlGapType" IS NOT NULL
              OR i."remediationPlan" IS NOT NULL
              OR i."reporterUserId" IS NOT NULL
              OR i."remediationOwnerUserId" IS NOT NULL
              OR i."remediationDueAt" IS NOT NULL
    THEN jsonb_build_object(
        'migratedFrom', 'Issue',
        'findingSource', i."findingSource"::text,
        'controlGapType', i."controlGapType"::text,
        'remediationPlan', i."remediationPlan",
        'reporterUserId', i."reporterUserId",
        'remediationOwnerUserId', i."remediationOwnerUserId",
        'remediationDueAt', i."remediationDueAt"
    )
    ELSE jsonb_build_object('migratedFrom', 'Issue')
    END,
    i."createdAt",
    i."updatedAt"
FROM "_legacy_Issue" i;

-- Step 7: Data migration — old Task → new Task (with generated IDs to avoid collision)
INSERT INTO "Task" ("id", "tenantId", "type", "title", "description", "status", "dueAt", "createdByUserId", "assigneeUserId", "controlId", "metadataJson", "createdAt", "updatedAt")
SELECT
    t."id",
    t."tenantId",
    'TASK'::"WorkItemType",
    t."title",
    t."description",
    CASE
      WHEN t."status"::text = 'TODO' THEN 'OPEN'::"WorkItemStatus"
      WHEN t."status"::text = 'IN_PROGRESS' THEN 'IN_PROGRESS'::"WorkItemStatus"
      WHEN t."status"::text = 'DONE' THEN 'CLOSED'::"WorkItemStatus"
      ELSE 'OPEN'::"WorkItemStatus"
    END,
    t."dueDate",
    -- Old Task has no createdByUserId — use assigneeId or first user in tenant
    COALESCE(t."assigneeId", (SELECT u."id" FROM "User" u WHERE u."tenantId" = t."tenantId" LIMIT 1)),
    t."assigneeId",
    t."controlId",
    jsonb_build_object('migratedFrom', 'OldTask', 'clauseId', t."clauseId", 'auditId', t."auditId", 'findingId', t."findingId"),
    t."createdAt",
    t."updatedAt"
FROM "_legacy_Task" t
WHERE NOT EXISTS (SELECT 1 FROM "Task" nt WHERE nt."id" = t."id");

-- Step 8: Migrate IssueComment → TaskComment
INSERT INTO "TaskComment" ("id", "tenantId", "taskId", "body", "createdByUserId", "createdAt", "updatedAt")
SELECT
    c."id",
    c."tenantId",
    c."issueId",  -- same ID as Task now
    c."body",
    c."createdByUserId",
    c."createdAt",
    c."updatedAt"
FROM "_legacy_IssueComment" c
WHERE EXISTS (SELECT 1 FROM "Task" t WHERE t."id" = c."issueId");

-- Step 9: Migrate IssueLink → TaskLink
INSERT INTO "TaskLink" ("id", "tenantId", "taskId", "entityType", "entityId", "relation", "createdAt")
SELECT
    l."id",
    l."tenantId",
    l."issueId",  -- same ID as Task now
    l."entityType"::text::"TaskLinkEntityType",
    l."entityId",
    l."relation"::text::"TaskLinkRelation",
    l."createdAt"
FROM "_legacy_IssueLink" l
WHERE EXISTS (SELECT 1 FROM "Task" t WHERE t."id" = l."issueId");

-- Step 10: Migrate IssueWatcher → TaskWatcher
INSERT INTO "TaskWatcher" ("id", "tenantId", "taskId", "userId")
SELECT
    w."id",
    w."tenantId",
    w."issueId",  -- same ID as Task now
    w."userId"
FROM "_legacy_IssueWatcher" w
WHERE EXISTS (SELECT 1 FROM "Task" t WHERE t."id" = w."issueId");

-- Step 11: Create indexes
CREATE INDEX "Task_tenantId_idx" ON "Task"("tenantId");
CREATE INDEX "Task_tenantId_status_idx" ON "Task"("tenantId", "status");
CREATE INDEX "Task_tenantId_type_idx" ON "Task"("tenantId", "type");
CREATE INDEX "Task_tenantId_severity_idx" ON "Task"("tenantId", "severity");
CREATE INDEX "Task_tenantId_assigneeUserId_idx" ON "Task"("tenantId", "assigneeUserId");
CREATE INDEX "Task_tenantId_dueAt_idx" ON "Task"("tenantId", "dueAt");
CREATE INDEX "Task_tenantId_controlId_idx" ON "Task"("tenantId", "controlId");
CREATE UNIQUE INDEX "Task_tenantId_key_key" ON "Task"("tenantId", "key");

CREATE INDEX "TaskLink_tenantId_taskId_idx" ON "TaskLink"("tenantId", "taskId");
CREATE UNIQUE INDEX "TaskLink_tenantId_taskId_entityType_entityId_key" ON "TaskLink"("tenantId", "taskId", "entityType", "entityId");

CREATE INDEX "TaskComment_tenantId_taskId_idx" ON "TaskComment"("tenantId", "taskId");

CREATE INDEX "TaskWatcher_tenantId_taskId_idx" ON "TaskWatcher"("tenantId", "taskId");
CREATE UNIQUE INDEX "TaskWatcher_taskId_userId_key" ON "TaskWatcher"("taskId", "userId");

-- Step 12: Add foreign keys
ALTER TABLE "Task" ADD CONSTRAINT "Task_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "Control"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TaskLink" ADD CONSTRAINT "TaskLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskLink" ADD CONSTRAINT "TaskLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TaskWatcher" ADD CONSTRAINT "TaskWatcher_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskWatcher" ADD CONSTRAINT "TaskWatcher_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskWatcher" ADD CONSTRAINT "TaskWatcher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
