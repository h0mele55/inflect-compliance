-- ═══════════════════════════════════════════════════════════════════
-- Epic 44 RLS coverage — RiskMatrixConfig
-- ═══════════════════════════════════════════════════════════════════
--
-- The Epic 44 risk-matrix configuration table shipped without RLS
-- policies, so the rls-coverage guardrail flagged it as a tenant-
-- scoped model lacking the canonical `tenant_isolation` +
-- `tenant_isolation_insert` + `superuser_bypass` trio. This migration
-- closes the gap with the same policy shape Epic A.1 established for
-- every other Class A (direct-tenantId) table.
--
-- The usecase already routes through `runInTenantContext` so the
-- runtime contract was already correct; this migration adds the
-- defence-in-depth RLS layer the schema audit expects.
--
-- Policies:
--   tenant_isolation        — USING tenantId = app.tenant_id
--   tenant_isolation_insert — INSERT WITH CHECK tenantId = app.tenant_id
--   superuser_bypass        — USING current_setting('role') != 'app_user'
--
-- Idempotent: DROP POLICY IF EXISTS before every CREATE.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE "RiskMatrixConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RiskMatrixConfig" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "RiskMatrixConfig";
CREATE POLICY tenant_isolation ON "RiskMatrixConfig"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);

DROP POLICY IF EXISTS tenant_isolation_insert ON "RiskMatrixConfig";
CREATE POLICY tenant_isolation_insert ON "RiskMatrixConfig"
    FOR INSERT
    WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

DROP POLICY IF EXISTS superuser_bypass ON "RiskMatrixConfig";
CREATE POLICY superuser_bypass ON "RiskMatrixConfig"
    USING (current_setting('role') != 'app_user');
