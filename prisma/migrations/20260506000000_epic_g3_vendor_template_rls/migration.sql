-- ═══════════════════════════════════════════════════════════════════
-- Epic G-3 — Add tenant_isolation + superuser_bypass RLS to the
-- vendor questionnaire template trio that PR #148 forgot.
-- ═══════════════════════════════════════════════════════════════════
--
-- The Epic G-3 schema landed three tenant-scoped tables
-- (`VendorAssessmentTemplate`, `VendorAssessmentTemplateSection`,
-- `VendorAssessmentTemplateQuestion`) without enabling RLS. The
-- structural ratchet at `tests/guardrails/rls-coverage.test.ts`
-- detected the gap once the local `DB_AVAILABLE` check was repaired
-- (it had been silently skipping under a Prisma-7 ctor regression).
--
-- Same Class A pattern as `20260422180000_enable_rls_coverage` —
-- direct `tenantId` column on each table, three-policy setup with
-- the canonical `tenant_isolation` / `tenant_isolation_insert` /
-- `superuser_bypass` shape.
--
-- Idempotent — safe to re-run.

-- ── VendorAssessmentTemplate ───────────────────────────────────────
ALTER TABLE "VendorAssessmentTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VendorAssessmentTemplate" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "VendorAssessmentTemplate";
CREATE POLICY tenant_isolation ON "VendorAssessmentTemplate"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "VendorAssessmentTemplate";
CREATE POLICY tenant_isolation_insert ON "VendorAssessmentTemplate"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "VendorAssessmentTemplate";
CREATE POLICY superuser_bypass ON "VendorAssessmentTemplate"
    USING (current_setting('role') != 'app_user');

-- ── VendorAssessmentTemplateSection ────────────────────────────────
ALTER TABLE "VendorAssessmentTemplateSection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VendorAssessmentTemplateSection" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "VendorAssessmentTemplateSection";
CREATE POLICY tenant_isolation ON "VendorAssessmentTemplateSection"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "VendorAssessmentTemplateSection";
CREATE POLICY tenant_isolation_insert ON "VendorAssessmentTemplateSection"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "VendorAssessmentTemplateSection";
CREATE POLICY superuser_bypass ON "VendorAssessmentTemplateSection"
    USING (current_setting('role') != 'app_user');

-- ── VendorAssessmentTemplateQuestion ───────────────────────────────
ALTER TABLE "VendorAssessmentTemplateQuestion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VendorAssessmentTemplateQuestion" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "VendorAssessmentTemplateQuestion";
CREATE POLICY tenant_isolation ON "VendorAssessmentTemplateQuestion"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "VendorAssessmentTemplateQuestion";
CREATE POLICY tenant_isolation_insert ON "VendorAssessmentTemplateQuestion"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "VendorAssessmentTemplateQuestion";
CREATE POLICY superuser_bypass ON "VendorAssessmentTemplateQuestion"
    USING (current_setting('role') != 'app_user');
