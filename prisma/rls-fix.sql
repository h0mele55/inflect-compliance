-- ═══════════════════════════════════════════════════════════════════
-- RLS Fix for tables WITHOUT a tenantId column
-- ═══════════════════════════════════════════════════════════════════
-- 
-- These tables are tenant-scoped by relationship (FK chains to parent
-- tables that DO have tenantId + RLS). They use USING(true) WITH CHECK(true)
-- as a temporary measure — each should gain its own tenantId column
-- in a future migration so proper isolation can replace the allow_all policy.
--
-- This script is fully IDEMPOTENT — safe to re-run at any time.
-- ═══════════════════════════════════════════════════════════════════

-- PolicyVersion: REMOVED — now has tenantId column, handled in rls-setup.sql

-- PolicyApproval (no tenantId — child of Policy)
DROP POLICY IF EXISTS tenant_isolation ON "PolicyApproval";
DROP POLICY IF EXISTS tenant_isolation_insert ON "PolicyApproval";
DROP POLICY IF EXISTS allow_all ON "PolicyApproval";
ALTER TABLE "PolicyApproval" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyApproval" FORCE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON "PolicyApproval" USING (true) WITH CHECK (true);

-- PolicyAcknowledgement (no tenantId — child of PolicyVersion)
DROP POLICY IF EXISTS tenant_isolation ON "PolicyAcknowledgement";
DROP POLICY IF EXISTS tenant_isolation_insert ON "PolicyAcknowledgement";
DROP POLICY IF EXISTS allow_all ON "PolicyAcknowledgement";
ALTER TABLE "PolicyAcknowledgement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyAcknowledgement" FORCE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON "PolicyAcknowledgement" USING (true) WITH CHECK (true);

-- PolicyControlLink (no tenantId — junction of Policy × Control)
-- Isolation via EXISTS against parent tables.
--
-- IMPORTANT: We use a SINGLE policy with both USING and WITH CHECK because
-- PostgreSQL's permissive policy semantics mean that a FOR ALL USING clause
-- implicitly doubles as WITH CHECK for inserts. If we had two separate
-- permissive policies (one FOR ALL checking only Policy, one FOR INSERT
-- checking both Policy+Control), the FOR ALL USING would pass for inserts
-- where the Policy belongs to the tenant—even if the Control doesn't.
--
-- USING:       visible if the linked Policy belongs to the current tenant
-- WITH CHECK:  insertable only if BOTH Policy AND Control belong to tenant
DROP POLICY IF EXISTS tenant_isolation ON "PolicyControlLink";
DROP POLICY IF EXISTS tenant_isolation_insert ON "PolicyControlLink";
DROP POLICY IF EXISTS allow_all ON "PolicyControlLink";
ALTER TABLE "PolicyControlLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyControlLink" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "PolicyControlLink"
    USING (
        EXISTS (
            SELECT 1 FROM "Policy" p
            WHERE p.id = "policyId"
              AND p."tenantId" = current_setting('app.tenant_id', true)::text
        )
    )
    WITH CHECK (
        -- INSERT/UPDATE: the Policy must belong to the current tenant
        EXISTS (
            SELECT 1 FROM "Policy" p
            WHERE p.id = "policyId"
              AND p."tenantId" = current_setting('app.tenant_id', true)::text
        )
        AND
        -- INSERT/UPDATE: the Control must belong to the current tenant (or be global)
        EXISTS (
            SELECT 1 FROM "Control" c
            WHERE c.id = "controlId"
              AND (c."tenantId" IS NULL OR c."tenantId" = current_setting('app.tenant_id', true)::text)
        )
    );

-- EvidenceReview (no tenantId — child of Evidence)
DROP POLICY IF EXISTS tenant_isolation ON "EvidenceReview";
DROP POLICY IF EXISTS tenant_isolation_insert ON "EvidenceReview";
DROP POLICY IF EXISTS allow_all ON "EvidenceReview";
ALTER TABLE "EvidenceReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvidenceReview" FORCE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON "EvidenceReview" USING (true) WITH CHECK (true);

-- FindingEvidence (no tenantId — junction of Finding × Evidence)
DROP POLICY IF EXISTS tenant_isolation ON "FindingEvidence";
DROP POLICY IF EXISTS tenant_isolation_insert ON "FindingEvidence";
DROP POLICY IF EXISTS allow_all ON "FindingEvidence";
ALTER TABLE "FindingEvidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FindingEvidence" FORCE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON "FindingEvidence" USING (true) WITH CHECK (true);

-- AuditChecklistItem (no tenantId — child of Audit)
DROP POLICY IF EXISTS tenant_isolation ON "AuditChecklistItem";
DROP POLICY IF EXISTS tenant_isolation_insert ON "AuditChecklistItem";
DROP POLICY IF EXISTS allow_all ON "AuditChecklistItem";
ALTER TABLE "AuditChecklistItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditChecklistItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON "AuditChecklistItem" USING (true) WITH CHECK (true);

-- AuditorPackAccess (no tenantId — junction of AuditorAccount × AuditPack)
DROP POLICY IF EXISTS tenant_isolation ON "AuditorPackAccess";
DROP POLICY IF EXISTS tenant_isolation_insert ON "AuditorPackAccess";
DROP POLICY IF EXISTS allow_all ON "AuditorPackAccess";
ALTER TABLE "AuditorPackAccess" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditorPackAccess" FORCE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON "AuditorPackAccess" USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════
-- GLOBAL TABLES — no RLS needed
-- ═══════════════════════════════════════════════════════════════════
-- User, Account, AuthSession, VerificationToken, Tenant
-- Clause, ControlTemplate, ControlTemplateTask, ControlTemplateRequirementLink
-- Framework, FrameworkRequirement, FrameworkPack, PackTemplateLink, FrameworkMapping
-- PolicyTemplate, QuestionnaireTemplate, QuestionnaireQuestion, RiskTemplate

SELECT 'RLS fix applied!' AS result;
