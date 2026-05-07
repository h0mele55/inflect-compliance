-- ═══════════════════════════════════════════════════════════════════
-- Epic G-4 — Access Review Campaigns (SOC 2 CC6.2).
--
-- Two new tenant-scoped tables that together model periodic user
-- access certification:
--
--   AccessReview          — campaign root (scope, period, reviewer,
--                            status lifecycle OPEN → IN_REVIEW →
--                            CLOSED, soft-delete columns).
--   AccessReviewDecision  — one row per subject user, snapshotted
--                            at campaign creation. Carries the
--                            reviewer's CONFIRM / REVOKE / MODIFY
--                            verdict + execution metadata.
--
-- Three new enums (AccessReviewScope / AccessReviewStatus /
-- AccessReviewDecisionType) — see prisma/schema/enums.prisma for
-- semantics.
--
-- RLS: both tables are Class-A direct-scoped (own `tenantId` column),
-- so they get the canonical three-policy setup
--   tenant_isolation        (USING)
--   tenant_isolation_insert (FOR INSERT WITH CHECK)
--   superuser_bypass        (USING role != 'app_user')
-- plus FORCE ROW LEVEL SECURITY. Mirrors
-- 20260506000000_epic_g3_vendor_template_rls verbatim.
-- ═══════════════════════════════════════════════════════════════════

-- ── Enums ──────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "AccessReviewScope" AS ENUM ('ALL_USERS', 'ADMIN_ONLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AccessReviewStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'CLOSED');

-- CreateEnum
CREATE TYPE "AccessReviewDecisionType" AS ENUM ('CONFIRM', 'REVOKE', 'MODIFY');

-- ── Tables ─────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "AccessReview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "AccessReviewScope" NOT NULL DEFAULT 'ALL_USERS',
    "periodStartAt" TIMESTAMP(3),
    "periodEndAt" TIMESTAMP(3),
    "reviewerUserId" TEXT NOT NULL,
    "status" "AccessReviewStatus" NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,

    CONSTRAINT "AccessReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessReviewDecision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accessReviewId" TEXT NOT NULL,
    "membershipId" TEXT,
    "subjectUserId" TEXT NOT NULL,
    "snapshotRole" "Role" NOT NULL,
    "snapshotCustomRoleId" TEXT,
    "snapshotMembershipStatus" "MembershipStatus" NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decision" "AccessReviewDecisionType",
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,
    "notes" TEXT,
    "modifiedToRole" "Role",
    "modifiedToCustomRoleId" TEXT,
    "executedAt" TIMESTAMP(3),
    "executedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessReviewDecision_pkey" PRIMARY KEY ("id")
);

-- ── Indexes ────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "AccessReview_id_tenantId_key" ON "AccessReview"("id", "tenantId");
CREATE INDEX "AccessReview_tenantId_status_idx" ON "AccessReview"("tenantId", "status");
CREATE INDEX "AccessReview_tenantId_reviewerUserId_status_idx" ON "AccessReview"("tenantId", "reviewerUserId", "status");
CREATE INDEX "AccessReview_tenantId_dueAt_idx" ON "AccessReview"("tenantId", "dueAt");
CREATE INDEX "AccessReview_tenantId_deletedAt_idx" ON "AccessReview"("tenantId", "deletedAt");
CREATE INDEX "AccessReview_tenantId_createdAt_idx" ON "AccessReview"("tenantId", "createdAt");

CREATE UNIQUE INDEX "AccessReviewDecision_accessReviewId_subjectUserId_key" ON "AccessReviewDecision"("accessReviewId", "subjectUserId");
CREATE INDEX "AccessReviewDecision_tenantId_accessReviewId_idx" ON "AccessReviewDecision"("tenantId", "accessReviewId");
CREATE INDEX "AccessReviewDecision_tenantId_accessReviewId_decision_idx" ON "AccessReviewDecision"("tenantId", "accessReviewId", "decision");
CREATE INDEX "AccessReviewDecision_tenantId_subjectUserId_idx" ON "AccessReviewDecision"("tenantId", "subjectUserId");
CREATE INDEX "AccessReviewDecision_tenantId_membershipId_idx" ON "AccessReviewDecision"("tenantId", "membershipId");

-- ── Foreign keys ───────────────────────────────────────────────────

ALTER TABLE "AccessReview" ADD CONSTRAINT "AccessReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccessReview" ADD CONSTRAINT "AccessReview_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccessReview" ADD CONSTRAINT "AccessReview_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccessReview" ADD CONSTRAINT "AccessReview_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccessReview" ADD CONSTRAINT "AccessReview_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccessReviewDecision" ADD CONSTRAINT "AccessReviewDecision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Composite parent (accessReviewId, tenantId) → AccessReview(id, tenantId).
-- Cross-tenant child references are impossible by construction.
-- ON DELETE CASCADE so a campaign hard-delete garbage-collects its
-- decisions; soft-delete (deletedAt) is the production retention path.
ALTER TABLE "AccessReviewDecision" ADD CONSTRAINT "AccessReviewDecision_accessReviewId_tenantId_fkey" FOREIGN KEY ("accessReviewId", "tenantId") REFERENCES "AccessReview"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
-- SetNull on membership delete so a mid-review offboard doesn't shred
-- the audit row; snapshot fields preserve the evidence trail.
ALTER TABLE "AccessReviewDecision" ADD CONSTRAINT "AccessReviewDecision_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "TenantMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccessReviewDecision" ADD CONSTRAINT "AccessReviewDecision_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccessReviewDecision" ADD CONSTRAINT "AccessReviewDecision_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccessReviewDecision" ADD CONSTRAINT "AccessReviewDecision_executedByUserId_fkey" FOREIGN KEY ("executedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── CHECK constraints ──────────────────────────────────────────────

-- A MODIFY decision MUST specify the target role; CONFIRM / REVOKE
-- MUST NOT. Enforced at the storage layer so a malformed write cannot
-- leak past the usecase validator.
ALTER TABLE "AccessReviewDecision"
    ADD CONSTRAINT "AccessReviewDecision_modify_role_present"
    CHECK (
        ("decision" IS DISTINCT FROM 'MODIFY' AND "modifiedToRole" IS NULL)
        OR ("decision" = 'MODIFY' AND "modifiedToRole" IS NOT NULL)
    );

-- A decided row needs both decidedAt + decidedByUserId; an undecided
-- row has neither.
ALTER TABLE "AccessReviewDecision"
    ADD CONSTRAINT "AccessReviewDecision_decided_pair"
    CHECK (
        ("decision" IS NULL AND "decidedAt" IS NULL AND "decidedByUserId" IS NULL)
        OR ("decision" IS NOT NULL AND "decidedAt" IS NOT NULL AND "decidedByUserId" IS NOT NULL)
    );

-- An executed row needs both executedAt + executedByUserId. Without
-- the executor we can't show "who applied the decision" in evidence.
ALTER TABLE "AccessReviewDecision"
    ADD CONSTRAINT "AccessReviewDecision_executed_pair"
    CHECK (
        ("executedAt" IS NULL AND "executedByUserId" IS NULL)
        OR ("executedAt" IS NOT NULL AND "executedByUserId" IS NOT NULL)
    );

-- ── Row Level Security ─────────────────────────────────────────────

ALTER TABLE "AccessReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccessReview" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AccessReview";
CREATE POLICY tenant_isolation ON "AccessReview"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "AccessReview";
CREATE POLICY tenant_isolation_insert ON "AccessReview"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "AccessReview";
CREATE POLICY superuser_bypass ON "AccessReview"
    USING (current_setting('role') != 'app_user');

ALTER TABLE "AccessReviewDecision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccessReviewDecision" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AccessReviewDecision";
CREATE POLICY tenant_isolation ON "AccessReviewDecision"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "AccessReviewDecision";
CREATE POLICY tenant_isolation_insert ON "AccessReviewDecision"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "AccessReviewDecision";
CREATE POLICY superuser_bypass ON "AccessReviewDecision"
    USING (current_setting('role') != 'app_user');
