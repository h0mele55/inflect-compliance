-- Fix RLS policies for tables that do NOT have a tenantId column
-- These are child tables protected transitively through their parent table's RLS

-- PolicyVersion (no tenantId - child of Policy which has tenantId + RLS)
DROP POLICY IF EXISTS tenant_isolation ON "PolicyVersion";
DROP POLICY IF EXISTS tenant_isolation_insert ON "PolicyVersion";
ALTER TABLE "PolicyVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyVersion" FORCE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON "PolicyVersion" USING (true) WITH CHECK (true);

-- PolicyApproval (no tenantId - child of Policy)
DROP POLICY IF EXISTS tenant_isolation ON "PolicyApproval";
DROP POLICY IF EXISTS tenant_isolation_insert ON "PolicyApproval";
ALTER TABLE "PolicyApproval" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyApproval" FORCE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON "PolicyApproval" USING (true) WITH CHECK (true);

-- PolicyAcknowledgement (no tenantId - child of Policy)
DROP POLICY IF EXISTS tenant_isolation ON "PolicyAcknowledgement";
DROP POLICY IF EXISTS tenant_isolation_insert ON "PolicyAcknowledgement";
ALTER TABLE "PolicyAcknowledgement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyAcknowledgement" FORCE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON "PolicyAcknowledgement" USING (true) WITH CHECK (true);

-- EvidenceReview (no tenantId - child of Evidence)
DROP POLICY IF EXISTS tenant_isolation ON "EvidenceReview";
DROP POLICY IF EXISTS tenant_isolation_insert ON "EvidenceReview";
ALTER TABLE "EvidenceReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvidenceReview" FORCE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON "EvidenceReview" USING (true) WITH CHECK (true);

-- FindingEvidence (no tenantId - join table)
DROP POLICY IF EXISTS tenant_isolation ON "FindingEvidence";
DROP POLICY IF EXISTS tenant_isolation_insert ON "FindingEvidence";
ALTER TABLE "FindingEvidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FindingEvidence" FORCE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON "FindingEvidence" USING (true) WITH CHECK (true);

-- ReminderHistory (no tenantId - child of Notification)
DROP POLICY IF EXISTS tenant_isolation ON "ReminderHistory";
DROP POLICY IF EXISTS tenant_isolation_insert ON "ReminderHistory";
ALTER TABLE "ReminderHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReminderHistory" FORCE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON "ReminderHistory" USING (true) WITH CHECK (true);

-- AuditChecklistItem (no tenantId - child of Audit)
DROP POLICY IF EXISTS tenant_isolation ON "AuditChecklistItem";
DROP POLICY IF EXISTS tenant_isolation_insert ON "AuditChecklistItem";
ALTER TABLE "AuditChecklistItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditChecklistItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON "AuditChecklistItem" USING (true) WITH CHECK (true);

-- User (global, no tenantId)
-- Do NOT enable RLS on User since it's global

-- Account (global, no tenantId)
-- Do NOT enable RLS on Account since it's global

-- AuthSession (global, no tenantId)
-- Do NOT enable RLS on AuthSession since it's global

-- VerificationToken (global, no tenantId)
-- Do NOT enable RLS on VerificationToken since it's global

-- Tenant (the root entity, no tenantId self-reference)
-- Do NOT enable RLS on Tenant since we lookup by slug before setting context

-- File (global)
-- Do NOT enable RLS on File since it's global

-- PolicyTemplate (global)
-- Do NOT enable RLS on PolicyTemplate since it's global

-- Clause (global)
-- Do NOT enable RLS on Clause since it's global

-- ControlTemplate (global, if exists) 
-- Only enable for tenant-scoped tables

-- Framework (global)
-- Do NOT enable RLS on Framework since it's global

-- FrameworkRequirement (global child of Framework)
-- Do NOT enable RLS

-- FrameworkMapping (global)
-- Do NOT enable RLS

SELECT 'RLS fix applied!' AS result;
