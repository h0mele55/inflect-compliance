-- ═══════════════════════════════════════════════════════════════════
-- Epic G-7 — Risk Treatment Plans (ISO 27001 6.1.3).
--
-- Two new tenant-scoped tables modelling structured treatment plans:
--   RiskTreatmentPlan   — strategy + owner + target date + status
--                         lifecycle (DRAFT → ACTIVE → COMPLETED |
--                         OVERDUE)
--   TreatmentMilestone  — ordered milestones within a plan, each
--                         with its own due date + completion state
--
-- Two new enums (TreatmentStrategy / TreatmentPlanStatus) — see
-- prisma/schema/enums.prisma for semantics.
--
-- Class-A direct-scoped RLS — canonical three-policy setup
--   tenant_isolation        (USING)
--   tenant_isolation_insert (FOR INSERT WITH CHECK)
--   superuser_bypass        (USING role != 'app_user')
-- plus FORCE ROW LEVEL SECURITY. Mirrors
-- 20260507140000_epic_g5_control_exceptions verbatim.
--
-- Schema-shape constraints (CHECK):
--   • A COMPLETED plan MUST carry completedAt + completedByUserId.
--   • Non-COMPLETED plans MUST NOT carry completedAt /
--     completedByUserId / closingRemark — those slots are reserved
--     for the completion transition.
--   • A milestone with completedAt set MUST also carry
--     completedByUserId (and vice versa).
--
-- Adding the composite unique `(id, tenantId)` to Risk is purely
-- additive (the primary key already enforces id uniqueness; this
-- supports the composite-FK shape Prisma generates for
-- RiskTreatmentPlan → Risk). Mirrors the Audit / AccessReview /
-- ControlException pattern.
-- ═══════════════════════════════════════════════════════════════════

-- ── Enums ──────────────────────────────────────────────────────────

CREATE TYPE "TreatmentStrategy" AS ENUM ('MITIGATE', 'ACCEPT', 'TRANSFER', 'AVOID');
CREATE TYPE "TreatmentPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'OVERDUE');

-- ── Composite parent key on Risk ───────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Risk_id_tenantId_key'
    ) THEN
        ALTER TABLE "Risk"
            ADD CONSTRAINT "Risk_id_tenantId_key" UNIQUE ("id", "tenantId");
    END IF;
END
$$;

-- ── Tables ─────────────────────────────────────────────────────────

CREATE TABLE "RiskTreatmentPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "strategy" "TreatmentStrategy" NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "status" "TreatmentPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "closingRemark" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,

    CONSTRAINT "RiskTreatmentPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TreatmentMilestone" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "treatmentPlanId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "evidence" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreatmentMilestone_pkey" PRIMARY KEY ("id")
);

-- ── Composite parent keys on the new tables ───────────────────────

CREATE UNIQUE INDEX "RiskTreatmentPlan_id_tenantId_key" ON "RiskTreatmentPlan"("id", "tenantId");

-- ── Indexes ────────────────────────────────────────────────────────

CREATE INDEX "RiskTreatmentPlan_tenantId_status_idx" ON "RiskTreatmentPlan"("tenantId", "status");
CREATE INDEX "RiskTreatmentPlan_tenantId_riskId_idx" ON "RiskTreatmentPlan"("tenantId", "riskId");
CREATE INDEX "RiskTreatmentPlan_tenantId_ownerUserId_status_idx" ON "RiskTreatmentPlan"("tenantId", "ownerUserId", "status");
CREATE INDEX "RiskTreatmentPlan_tenantId_targetDate_idx" ON "RiskTreatmentPlan"("tenantId", "targetDate");
CREATE INDEX "RiskTreatmentPlan_tenantId_deletedAt_idx" ON "RiskTreatmentPlan"("tenantId", "deletedAt");
CREATE INDEX "RiskTreatmentPlan_tenantId_createdAt_idx" ON "RiskTreatmentPlan"("tenantId", "createdAt");

CREATE INDEX "TreatmentMilestone_tenantId_treatmentPlanId_idx" ON "TreatmentMilestone"("tenantId", "treatmentPlanId");
CREATE INDEX "TreatmentMilestone_tenantId_dueDate_idx" ON "TreatmentMilestone"("tenantId", "dueDate");
CREATE INDEX "TreatmentMilestone_tenantId_completedAt_idx" ON "TreatmentMilestone"("tenantId", "completedAt");
CREATE INDEX "TreatmentMilestone_treatmentPlanId_sortOrder_idx" ON "TreatmentMilestone"("treatmentPlanId", "sortOrder");

-- ── Foreign keys ───────────────────────────────────────────────────

ALTER TABLE "RiskTreatmentPlan"
    ADD CONSTRAINT "RiskTreatmentPlan_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite FK — the risk must live in the same tenant.
-- Cross-tenant treatment-plan registration is impossible.
ALTER TABLE "RiskTreatmentPlan"
    ADD CONSTRAINT "RiskTreatmentPlan_riskId_tenantId_fkey"
    FOREIGN KEY ("riskId", "tenantId") REFERENCES "Risk"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RiskTreatmentPlan"
    ADD CONSTRAINT "RiskTreatmentPlan_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RiskTreatmentPlan"
    ADD CONSTRAINT "RiskTreatmentPlan_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RiskTreatmentPlan"
    ADD CONSTRAINT "RiskTreatmentPlan_completedByUserId_fkey"
    FOREIGN KEY ("completedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RiskTreatmentPlan"
    ADD CONSTRAINT "RiskTreatmentPlan_deletedByUserId_fkey"
    FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TreatmentMilestone"
    ADD CONSTRAINT "TreatmentMilestone_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite FK to parent plan + cascade on plan delete (the parent
-- plan owns the lifecycle of its milestones).
ALTER TABLE "TreatmentMilestone"
    ADD CONSTRAINT "TreatmentMilestone_treatmentPlanId_tenantId_fkey"
    FOREIGN KEY ("treatmentPlanId", "tenantId") REFERENCES "RiskTreatmentPlan"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TreatmentMilestone"
    ADD CONSTRAINT "TreatmentMilestone_completedByUserId_fkey"
    FOREIGN KEY ("completedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── CHECK constraints ──────────────────────────────────────────────

-- COMPLETED plans MUST carry completedAt + completedByUserId.
-- Non-COMPLETED plans MUST NOT carry completion fields — those slots
-- are reserved for the completion transition.
ALTER TABLE "RiskTreatmentPlan"
    ADD CONSTRAINT "RiskTreatmentPlan_completion_shape"
    CHECK (
        ("status" = 'COMPLETED' AND "completedAt" IS NOT NULL AND "completedByUserId" IS NOT NULL)
        OR ("status" <> 'COMPLETED' AND "completedAt" IS NULL AND "completedByUserId" IS NULL AND "closingRemark" IS NULL)
    );

-- A milestone's completion fields are paired — completedAt and
-- completedByUserId must be both set or both null.
ALTER TABLE "TreatmentMilestone"
    ADD CONSTRAINT "TreatmentMilestone_completion_pair"
    CHECK (
        ("completedAt" IS NULL AND "completedByUserId" IS NULL)
        OR ("completedAt" IS NOT NULL AND "completedByUserId" IS NOT NULL)
    );

-- ── Row Level Security ─────────────────────────────────────────────

ALTER TABLE "RiskTreatmentPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RiskTreatmentPlan" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "RiskTreatmentPlan";
CREATE POLICY tenant_isolation ON "RiskTreatmentPlan"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "RiskTreatmentPlan";
CREATE POLICY tenant_isolation_insert ON "RiskTreatmentPlan"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "RiskTreatmentPlan";
CREATE POLICY superuser_bypass ON "RiskTreatmentPlan"
    USING (current_setting('role') != 'app_user');

ALTER TABLE "TreatmentMilestone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TreatmentMilestone" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TreatmentMilestone";
CREATE POLICY tenant_isolation ON "TreatmentMilestone"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "TreatmentMilestone";
CREATE POLICY tenant_isolation_insert ON "TreatmentMilestone"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "TreatmentMilestone";
CREATE POLICY superuser_bypass ON "TreatmentMilestone"
    USING (current_setting('role') != 'app_user');
