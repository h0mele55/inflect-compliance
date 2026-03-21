-- Fix: Add RLS policies and app_user grants for tables created in
-- 20260320131720_add_risk_suggestion_models that were missing them.
--
-- Without these, SET LOCAL ROLE app_user causes permission denied errors
-- because the grants from rls-setup.sql only applied to tables that existed
-- at the time it was run.

-- 1) Grant access to app_user on the new tables
GRANT SELECT, INSERT, UPDATE, DELETE ON "TenantOnboarding" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "RiskSuggestionSession" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "RiskSuggestionItem" TO app_user;

-- 2) Enable Row Level Security (idempotent)
ALTER TABLE "TenantOnboarding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RiskSuggestionSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RiskSuggestionItem" ENABLE ROW LEVEL SECURITY;

-- 3) Drop existing policies if any (idempotent cleanup)
DROP POLICY IF EXISTS "tenant_isolation" ON "TenantOnboarding";
DROP POLICY IF EXISTS "tenant_isolation" ON "RiskSuggestionSession";
DROP POLICY IF EXISTS "tenant_isolation" ON "RiskSuggestionItem";

-- 4) Create tenant isolation policies
CREATE POLICY "tenant_isolation" ON "TenantOnboarding"
    USING ("tenantId" = current_setting('app.tenant_id', true));

CREATE POLICY "tenant_isolation" ON "RiskSuggestionSession"
    USING ("tenantId" = current_setting('app.tenant_id', true));

CREATE POLICY "tenant_isolation" ON "RiskSuggestionItem"
    USING ("tenantId" = current_setting('app.tenant_id', true));
