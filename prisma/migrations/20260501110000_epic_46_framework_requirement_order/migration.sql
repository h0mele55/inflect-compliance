-- ═══════════════════════════════════════════════════════════════════
-- Epic 46.4 — FrameworkRequirementOrder (per-tenant reorder overlay)
-- ═══════════════════════════════════════════════════════════════════
--
-- Frameworks (`Framework`, `FrameworkRequirement`) are global rows
-- shared across every tenant. The Epic 46 framework builder lets a
-- tenant reorder requirements (and implicitly sections) without
-- mutating the global schema — this overlay table records the
-- per-tenant `sortOrder` overrides. The tree usecase
-- (`getFrameworkTree`) merges values from this table BEFORE handing
-- requirements to `buildFrameworkTree`.
--
-- RLS: canonical Class-A direct-tenantId shape. Mirrors
-- `RiskMatrixConfig` (Epic 44) — `tenant_isolation` USING +
-- `tenant_isolation_insert` WITH CHECK + `superuser_bypass`. The
-- ratchet at `tests/guardrails/rls-coverage.test.ts` would fail CI
-- without these.

-- ── Table ────────────────────────────────────────────────────────────
CREATE TABLE "FrameworkRequirementOrder" (
    "id"            TEXT NOT NULL,
    "tenantId"      TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "sortOrder"     INTEGER NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FrameworkRequirementOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FrameworkRequirementOrder_tenantId_requirementId_key"
    ON "FrameworkRequirementOrder"("tenantId", "requirementId");
CREATE INDEX "FrameworkRequirementOrder_tenantId_idx"
    ON "FrameworkRequirementOrder"("tenantId");

ALTER TABLE "FrameworkRequirementOrder"
    ADD CONSTRAINT "FrameworkRequirementOrder_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FrameworkRequirementOrder"
    ADD CONSTRAINT "FrameworkRequirementOrder_requirementId_fkey"
    FOREIGN KEY ("requirementId") REFERENCES "FrameworkRequirement"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Row Level Security ──────────────────────────────────────────────
ALTER TABLE "FrameworkRequirementOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FrameworkRequirementOrder" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "FrameworkRequirementOrder";
CREATE POLICY tenant_isolation ON "FrameworkRequirementOrder"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);

DROP POLICY IF EXISTS tenant_isolation_insert ON "FrameworkRequirementOrder";
CREATE POLICY tenant_isolation_insert ON "FrameworkRequirementOrder"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

DROP POLICY IF EXISTS superuser_bypass ON "FrameworkRequirementOrder";
CREATE POLICY superuser_bypass ON "FrameworkRequirementOrder"
    USING (current_setting('role') != 'app_user');
