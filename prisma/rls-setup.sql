-- Re-create RLS setup after database reset
-- Creates the app_user role, grants, and RLS policies

-- 1) Create the app_user role (if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user NOLOGIN;
    END IF;
END
$$;

-- 2) Grant schema and table access to app_user
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- 3) Grant the app_user role to the postgres superuser so SET ROLE works
GRANT app_user TO postgres;

-- 4) Enable RLS on tenant-scoped tables and create policies
-- List of tables that have a tenantId column

-- Risk
ALTER TABLE "Risk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Risk" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Risk";
CREATE POLICY tenant_isolation ON "Risk"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "Risk";
CREATE POLICY tenant_isolation_insert ON "Risk"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- Policy (PolicyDocument)
ALTER TABLE "Policy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Policy" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Policy";
CREATE POLICY tenant_isolation ON "Policy"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "Policy";
CREATE POLICY tenant_isolation_insert ON "Policy"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- Evidence
ALTER TABLE "Evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Evidence" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Evidence";
CREATE POLICY tenant_isolation ON "Evidence"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "Evidence";
CREATE POLICY tenant_isolation_insert ON "Evidence"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- Control (nullable tenantId — global controls have null tenantId)
ALTER TABLE "Control" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Control" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Control";
CREATE POLICY tenant_isolation ON "Control"
    USING ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "Control";
CREATE POLICY tenant_isolation_insert ON "Control"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- Asset
ALTER TABLE "Asset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Asset" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Asset";
CREATE POLICY tenant_isolation ON "Asset"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "Asset";
CREATE POLICY tenant_isolation_insert ON "Asset"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- Task
ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Task" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Task";
CREATE POLICY tenant_isolation ON "Task"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "Task";
CREATE POLICY tenant_isolation_insert ON "Task"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- TaskLink
ALTER TABLE "TaskLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskLink" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TaskLink";
CREATE POLICY tenant_isolation ON "TaskLink"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "TaskLink";
CREATE POLICY tenant_isolation_insert ON "TaskLink"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- TaskComment
ALTER TABLE "TaskComment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskComment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TaskComment";
CREATE POLICY tenant_isolation ON "TaskComment"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "TaskComment";
CREATE POLICY tenant_isolation_insert ON "TaskComment"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- TaskWatcher
ALTER TABLE "TaskWatcher" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskWatcher" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TaskWatcher";
CREATE POLICY tenant_isolation ON "TaskWatcher"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "TaskWatcher";
CREATE POLICY tenant_isolation_insert ON "TaskWatcher"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- ClauseProgress
ALTER TABLE "ClauseProgress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClauseProgress" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ClauseProgress";
CREATE POLICY tenant_isolation ON "ClauseProgress"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "ClauseProgress";
CREATE POLICY tenant_isolation_insert ON "ClauseProgress"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- AuditLog
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AuditLog";
CREATE POLICY tenant_isolation ON "AuditLog"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "AuditLog";
CREATE POLICY tenant_isolation_insert ON "AuditLog"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- Notification
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Notification";
CREATE POLICY tenant_isolation ON "Notification"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "Notification";
CREATE POLICY tenant_isolation_insert ON "Notification"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- Finding
ALTER TABLE "Finding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Finding" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Finding";
CREATE POLICY tenant_isolation ON "Finding"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "Finding";
CREATE POLICY tenant_isolation_insert ON "Finding"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- New control-related tables
-- ControlContributor
ALTER TABLE "ControlContributor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ControlContributor" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ControlContributor";
CREATE POLICY tenant_isolation ON "ControlContributor"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "ControlContributor";
CREATE POLICY tenant_isolation_insert ON "ControlContributor"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- ControlTask
ALTER TABLE "ControlTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ControlTask" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ControlTask";
CREATE POLICY tenant_isolation ON "ControlTask"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "ControlTask";
CREATE POLICY tenant_isolation_insert ON "ControlTask"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- ControlEvidenceLink
ALTER TABLE "ControlEvidenceLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ControlEvidenceLink" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ControlEvidenceLink";
CREATE POLICY tenant_isolation ON "ControlEvidenceLink"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "ControlEvidenceLink";
CREATE POLICY tenant_isolation_insert ON "ControlEvidenceLink"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- PolicyVersion
ALTER TABLE "PolicyVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyVersion" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PolicyVersion";
CREATE POLICY tenant_isolation ON "PolicyVersion"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "PolicyVersion";
CREATE POLICY tenant_isolation_insert ON "PolicyVersion"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- PolicyApproval
ALTER TABLE "PolicyApproval" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyApproval" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PolicyApproval";
CREATE POLICY tenant_isolation ON "PolicyApproval"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "PolicyApproval";
CREATE POLICY tenant_isolation_insert ON "PolicyApproval"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- TenantMembership
ALTER TABLE "TenantMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantMembership" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TenantMembership";
CREATE POLICY tenant_isolation ON "TenantMembership"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "TenantMembership";
CREATE POLICY tenant_isolation_insert ON "TenantMembership"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- RiskControl mapping
ALTER TABLE "RiskControl" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RiskControl" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "RiskControl";
CREATE POLICY tenant_isolation ON "RiskControl" USING (true);

-- ControlAsset mapping
ALTER TABLE "ControlAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ControlAsset" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ControlAsset";
CREATE POLICY tenant_isolation ON "ControlAsset" USING (true);

-- PolicyControlLink
ALTER TABLE "PolicyControlLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyControlLink" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PolicyControlLink";
CREATE POLICY tenant_isolation ON "PolicyControlLink" USING (true);

-- FrameworkMapping (no tenantId — global)
-- No RLS needed

-- File (no tenantId — global with access control at app layer)
-- No RLS needed

SELECT 'RLS setup complete!' AS result;
