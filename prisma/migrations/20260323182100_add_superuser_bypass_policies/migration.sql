-- ═══════════════════════════════════════════════════════════════════
-- Add superuser_bypass policies to all FORCE-RLS tables
-- ═══════════════════════════════════════════════════════════════════
--
-- Problem: FORCE ROW LEVEL SECURITY makes policies apply even to the
-- table owner (postgres). The auth layer (NextAuth JWT callback) queries
-- TenantMembership, TenantSecuritySettings, etc. WITHOUT a tenant context
-- because it's *discovering* the tenant from the user's membership.
--
-- Fix: Add a permissive superuser_bypass policy that passes when the
-- current session role is NOT app_user. This means:
--   - Normal Prisma queries (auth, admin, migrations) → bypass RLS
--   - Inside withTenantDb() where SET LOCAL ROLE app_user → tenant_isolation enforced
--
-- This is the standard PostgreSQL pattern for combining FORCE RLS with
-- application-level role switching.
--
-- Fully IDEMPOTENT — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ─── CORE ENTITIES ───

DROP POLICY IF EXISTS superuser_bypass ON "Risk";
CREATE POLICY superuser_bypass ON "Risk" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "Policy";
CREATE POLICY superuser_bypass ON "Policy" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "Evidence";
CREATE POLICY superuser_bypass ON "Evidence" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "Control";
CREATE POLICY superuser_bypass ON "Control" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "Asset";
CREATE POLICY superuser_bypass ON "Asset" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "Audit";
CREATE POLICY superuser_bypass ON "Audit" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "Finding";
CREATE POLICY superuser_bypass ON "Finding" USING (current_setting('role') != 'app_user');

-- ─── TASK/WORK ITEMS ───

DROP POLICY IF EXISTS superuser_bypass ON "Task";
CREATE POLICY superuser_bypass ON "Task" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "TaskLink";
CREATE POLICY superuser_bypass ON "TaskLink" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "TaskComment";
CREATE POLICY superuser_bypass ON "TaskComment" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "TaskWatcher";
CREATE POLICY superuser_bypass ON "TaskWatcher" USING (current_setting('role') != 'app_user');

-- ─── CONTROL SUB-ENTITIES ───

DROP POLICY IF EXISTS superuser_bypass ON "ControlContributor";
CREATE POLICY superuser_bypass ON "ControlContributor" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "ControlTask";
CREATE POLICY superuser_bypass ON "ControlTask" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "ControlEvidenceLink";
CREATE POLICY superuser_bypass ON "ControlEvidenceLink" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "ControlRequirementLink";
CREATE POLICY superuser_bypass ON "ControlRequirementLink" USING (current_setting('role') != 'app_user');

-- ─── MAPPING/JUNCTION TABLES ───

DROP POLICY IF EXISTS superuser_bypass ON "RiskControl";
CREATE POLICY superuser_bypass ON "RiskControl" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "ControlAsset";
CREATE POLICY superuser_bypass ON "ControlAsset" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "AssetRiskLink";
CREATE POLICY superuser_bypass ON "AssetRiskLink" USING (current_setting('role') != 'app_user');

-- ─── CLAUSE TRACKER ───

DROP POLICY IF EXISTS superuser_bypass ON "ClauseProgress";
CREATE POLICY superuser_bypass ON "ClauseProgress" USING (current_setting('role') != 'app_user');

-- ─── AUDIT & LOGGING ───

DROP POLICY IF EXISTS superuser_bypass ON "AuditLog";
CREATE POLICY superuser_bypass ON "AuditLog" USING (current_setting('role') != 'app_user');

-- ─── NOTIFICATIONS ───

DROP POLICY IF EXISTS superuser_bypass ON "Notification";
CREATE POLICY superuser_bypass ON "Notification" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "ReminderHistory";
CREATE POLICY superuser_bypass ON "ReminderHistory" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "NotificationOutbox";
CREATE POLICY superuser_bypass ON "NotificationOutbox" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "TenantNotificationSettings";
CREATE POLICY superuser_bypass ON "TenantNotificationSettings" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "UserNotificationPreference";
CREATE POLICY superuser_bypass ON "UserNotificationPreference" USING (current_setting('role') != 'app_user');

-- ─── MEMBERSHIP ───

DROP POLICY IF EXISTS superuser_bypass ON "TenantMembership";
CREATE POLICY superuser_bypass ON "TenantMembership" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "TenantOnboarding";
CREATE POLICY superuser_bypass ON "TenantOnboarding" USING (current_setting('role') != 'app_user');

-- ─── VENDOR MANAGEMENT ───

DROP POLICY IF EXISTS superuser_bypass ON "Vendor";
CREATE POLICY superuser_bypass ON "Vendor" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "VendorContact";
CREATE POLICY superuser_bypass ON "VendorContact" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "VendorDocument";
CREATE POLICY superuser_bypass ON "VendorDocument" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "VendorAssessment";
CREATE POLICY superuser_bypass ON "VendorAssessment" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "VendorAssessmentAnswer";
CREATE POLICY superuser_bypass ON "VendorAssessmentAnswer" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "VendorLink";
CREATE POLICY superuser_bypass ON "VendorLink" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "VendorEvidenceBundle";
CREATE POLICY superuser_bypass ON "VendorEvidenceBundle" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "VendorEvidenceBundleItem";
CREATE POLICY superuser_bypass ON "VendorEvidenceBundleItem" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "VendorRelationship";
CREATE POLICY superuser_bypass ON "VendorRelationship" USING (current_setting('role') != 'app_user');

-- ─── AUDIT READINESS ───

DROP POLICY IF EXISTS superuser_bypass ON "AuditCycle";
CREATE POLICY superuser_bypass ON "AuditCycle" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "AuditPack";
CREATE POLICY superuser_bypass ON "AuditPack" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "AuditPackItem";
CREATE POLICY superuser_bypass ON "AuditPackItem" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "AuditPackShare";
CREATE POLICY superuser_bypass ON "AuditPackShare" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "AuditorAccount";
CREATE POLICY superuser_bypass ON "AuditorAccount" USING (current_setting('role') != 'app_user');

-- ─── CONTROL TESTS ───

DROP POLICY IF EXISTS superuser_bypass ON "ControlTestPlan";
CREATE POLICY superuser_bypass ON "ControlTestPlan" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "ControlTestRun";
CREATE POLICY superuser_bypass ON "ControlTestRun" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "ControlTestEvidenceLink";
CREATE POLICY superuser_bypass ON "ControlTestEvidenceLink" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "ControlTestStep";
CREATE POLICY superuser_bypass ON "ControlTestStep" USING (current_setting('role') != 'app_user');

-- ─── FILES ───

DROP POLICY IF EXISTS superuser_bypass ON "FileRecord";
CREATE POLICY superuser_bypass ON "FileRecord" USING (current_setting('role') != 'app_user');

-- ─── AI RISK SUGGESTIONS ───

DROP POLICY IF EXISTS superuser_bypass ON "RiskSuggestionSession";
CREATE POLICY superuser_bypass ON "RiskSuggestionSession" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "RiskSuggestionItem";
CREATE POLICY superuser_bypass ON "RiskSuggestionItem" USING (current_setting('role') != 'app_user');

-- ─── BILLING ───

DROP POLICY IF EXISTS superuser_bypass ON "BillingAccount";
CREATE POLICY superuser_bypass ON "BillingAccount" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "BillingEvent";
CREATE POLICY superuser_bypass ON "BillingEvent" USING (current_setting('role') != 'app_user');

-- ─── POLICY VERSION ───

DROP POLICY IF EXISTS superuser_bypass ON "PolicyVersion";
CREATE POLICY superuser_bypass ON "PolicyVersion" USING (current_setting('role') != 'app_user');

-- ─── DEFERRED TABLES (from rls-fix.sql, also have FORCE RLS) ───

DROP POLICY IF EXISTS superuser_bypass ON "PolicyApproval";
CREATE POLICY superuser_bypass ON "PolicyApproval" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "PolicyAcknowledgement";
CREATE POLICY superuser_bypass ON "PolicyAcknowledgement" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "PolicyControlLink";
CREATE POLICY superuser_bypass ON "PolicyControlLink" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "EvidenceReview";
CREATE POLICY superuser_bypass ON "EvidenceReview" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "FindingEvidence";
CREATE POLICY superuser_bypass ON "FindingEvidence" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "AuditChecklistItem";
CREATE POLICY superuser_bypass ON "AuditChecklistItem" USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS superuser_bypass ON "AuditorPackAccess";
CREATE POLICY superuser_bypass ON "AuditorPackAccess" USING (current_setting('role') != 'app_user');

SELECT 'Superuser bypass policies applied to all FORCE-RLS tables' AS result;
