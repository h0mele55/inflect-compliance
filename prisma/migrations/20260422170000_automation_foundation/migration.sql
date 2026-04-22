-- Epic 60 — Automation Data Model & Domain Events (foundation)
-- Adds AutomationRule + AutomationExecution and their three enums.
-- Tenant-scoped, append-only-for-history semantics. See
-- prisma/schema.prisma for the domain-level rationale + field docs.

-- 1. Enums ------------------------------------------------------------
CREATE TYPE "AutomationRuleStatus"      AS ENUM ('DRAFT', 'ENABLED', 'DISABLED', 'ARCHIVED');
CREATE TYPE "AutomationExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');
CREATE TYPE "AutomationActionType"      AS ENUM ('NOTIFY_USER', 'CREATE_TASK', 'UPDATE_STATUS', 'WEBHOOK');

-- 2. AutomationRule ---------------------------------------------------
CREATE TABLE "AutomationRule" (
    "id"                  TEXT                   NOT NULL,
    "tenantId"            TEXT                   NOT NULL,
    "name"                TEXT                   NOT NULL,
    "description"         TEXT,
    "triggerEvent"        TEXT                   NOT NULL,
    "triggerFilterJson"   JSONB,
    "actionType"          "AutomationActionType" NOT NULL,
    "actionConfigJson"    JSONB                  NOT NULL,
    "status"              "AutomationRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "priority"            INTEGER                NOT NULL DEFAULT 0,
    "executionCount"      INTEGER                NOT NULL DEFAULT 0,
    "lastTriggeredAt"     TIMESTAMP(3),
    "createdByUserId"     TEXT,
    "updatedByUserId"     TEXT,
    "createdAt"           TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3)           NOT NULL,
    "deletedAt"           TIMESTAMP(3),

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- Unique: one rule name per tenant. Archiving via deletedAt rather
-- than rename keeps this constraint simple; a tenant that wants to
-- re-use a name must hard-delete the archived row first.
CREATE UNIQUE INDEX "AutomationRule_tenantId_name_key"
    ON "AutomationRule"("tenantId", "name");

CREATE INDEX "AutomationRule_tenantId_idx"
    ON "AutomationRule"("tenantId");
CREATE INDEX "AutomationRule_tenantId_status_idx"
    ON "AutomationRule"("tenantId", "status");
CREATE INDEX "AutomationRule_tenantId_triggerEvent_idx"
    ON "AutomationRule"("tenantId", "triggerEvent");
CREATE INDEX "AutomationRule_tenantId_deletedAt_idx"
    ON "AutomationRule"("tenantId", "deletedAt");
-- Hot path for the dispatcher: "find enabled rules for this event in
-- this tenant". The three-column composite avoids a sort + heap
-- lookup on the most common query pattern.
CREATE INDEX "AutomationRule_tenantId_triggerEvent_status_idx"
    ON "AutomationRule"("tenantId", "triggerEvent", "status");

-- 3. AutomationExecution ---------------------------------------------
CREATE TABLE "AutomationExecution" (
    "id"                  TEXT                        NOT NULL,
    "tenantId"            TEXT                        NOT NULL,
    "ruleId"              TEXT                        NOT NULL,
    "triggerEvent"        TEXT                        NOT NULL,
    "triggerPayloadJson"  JSONB                       NOT NULL,
    "status"              "AutomationExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "outcomeJson"         JSONB,
    "errorMessage"        TEXT,
    "errorStack"          TEXT,
    "durationMs"          INTEGER,
    "jobRunId"            TEXT,
    "triggeredBy"         TEXT                        NOT NULL DEFAULT 'event',
    "idempotencyKey"      TEXT,
    "startedAt"           TIMESTAMP(3),
    "completedAt"         TIMESTAMP(3),
    "createdAt"           TIMESTAMP(3)                NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationExecution_pkey" PRIMARY KEY ("id")
);

-- Dedup: a retried event shouldn't double-fire. `idempotencyKey` is
-- nullable so legacy / manual replays don't require the caller to
-- compute one, but when set it's enforced tenant-unique.
CREATE UNIQUE INDEX "AutomationExecution_tenantId_idempotencyKey_key"
    ON "AutomationExecution"("tenantId", "idempotencyKey");

CREATE INDEX "AutomationExecution_tenantId_idx"
    ON "AutomationExecution"("tenantId");
CREATE INDEX "AutomationExecution_tenantId_ruleId_idx"
    ON "AutomationExecution"("tenantId", "ruleId");
CREATE INDEX "AutomationExecution_tenantId_status_idx"
    ON "AutomationExecution"("tenantId", "status");
CREATE INDEX "AutomationExecution_tenantId_createdAt_idx"
    ON "AutomationExecution"("tenantId", "createdAt");
-- Per-rule history feed (rule detail page, debugging).
CREATE INDEX "AutomationExecution_ruleId_createdAt_idx"
    ON "AutomationExecution"("ruleId", "createdAt");
-- Event-centric feed (observability, cross-tenant ops).
CREATE INDEX "AutomationExecution_triggerEvent_createdAt_idx"
    ON "AutomationExecution"("triggerEvent", "createdAt");
-- Observability correlation with the job-runner span graph.
CREATE INDEX "AutomationExecution_jobRunId_idx"
    ON "AutomationExecution"("jobRunId");

-- 4. Foreign keys ----------------------------------------------------
ALTER TABLE "AutomationRule"
    ADD CONSTRAINT "AutomationRule_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AutomationExecution"
    ADD CONSTRAINT "AutomationExecution_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AutomationExecution"
    ADD CONSTRAINT "AutomationExecution_ruleId_fkey"
    FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
