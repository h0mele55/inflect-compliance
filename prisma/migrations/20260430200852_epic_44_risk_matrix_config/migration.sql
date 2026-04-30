-- Epic 44 — RiskMatrixConfig: tenant-scoped risk-matrix configuration.
--
-- One row per tenant (UNIQUE on tenantId). Existing tenants have no
-- row at migration time; the read usecase resolves the canonical
-- 5×5 default in code so we DO NOT backfill — that keeps the
-- migration small + safe for active tenants and keeps the canonical
-- default in one place (`src/lib/risk-matrix/defaults.ts`).
--
-- `levelLabels` is nullable JSONB so the UI can fall back to numeric
-- labels when an admin hasn't customised the per-level vocabulary.
-- `bands` defaults to '[]' rather than NULL so a row written before
-- bands are explicit is still iterable on the read path.

CREATE TABLE "RiskMatrixConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "likelihoodLevels" INTEGER NOT NULL DEFAULT 5,
    "impactLevels" INTEGER NOT NULL DEFAULT 5,
    "axisLikelihoodLabel" TEXT NOT NULL DEFAULT 'Likelihood',
    "axisImpactLabel" TEXT NOT NULL DEFAULT 'Impact',
    "levelLabels" JSONB,
    "bands" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskMatrixConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RiskMatrixConfig_tenantId_key" ON "RiskMatrixConfig"("tenantId");
CREATE INDEX "RiskMatrixConfig_tenantId_idx" ON "RiskMatrixConfig"("tenantId");

ALTER TABLE "RiskMatrixConfig"
    ADD CONSTRAINT "RiskMatrixConfig_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK: dimensions stay in a sane range so a runtime read can't
-- explode from a bad write that bypassed the application validator.
ALTER TABLE "RiskMatrixConfig"
    ADD CONSTRAINT "RiskMatrixConfig_likelihood_range"
    CHECK ("likelihoodLevels" BETWEEN 2 AND 10);

ALTER TABLE "RiskMatrixConfig"
    ADD CONSTRAINT "RiskMatrixConfig_impact_range"
    CHECK ("impactLevels" BETWEEN 2 AND 10);
