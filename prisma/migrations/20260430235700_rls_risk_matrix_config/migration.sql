-- ═══════════════════════════════════════════════════════════════════
-- RLS — RiskMatrixConfig (Epic 44 follow-up)
-- ═══════════════════════════════════════════════════════════════════
--
-- The `RiskMatrixConfig` model landed in Epic 44 prompt 1 with FK
-- + unique-on-tenantId constraints, but without the canonical
-- `tenant_isolation` + `superuser_bypass` policies. The
-- `rls-coverage.test.ts` guardrail (which scans every tenant-scoped
-- model in the prisma schema) caught it: at-rest reads under
-- `app_user` were already blocked by application-layer
-- `runInTenantContext` calls, but the DB-level enforcement was
-- absent — a bug that would only surface if a future code path
-- reached the table without going through the tenant-context
-- wrapper.
--
-- Same canonical Class-A shape every direct-tenantId table uses
-- (see 20260422180000_enable_rls_coverage for the full design).
-- IDEMPOTENT — safe to re-run via `DROP POLICY IF EXISTS`.

ALTER TABLE "RiskMatrixConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RiskMatrixConfig" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "RiskMatrixConfig";
CREATE POLICY tenant_isolation ON "RiskMatrixConfig"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);

DROP POLICY IF EXISTS tenant_isolation_insert ON "RiskMatrixConfig";
CREATE POLICY tenant_isolation_insert ON "RiskMatrixConfig"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

DROP POLICY IF EXISTS superuser_bypass ON "RiskMatrixConfig";
CREATE POLICY superuser_bypass ON "RiskMatrixConfig"
    USING (current_setting('role') != 'app_user');
