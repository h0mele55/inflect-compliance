-- ═══════════════════════════════════════════════════════════════════
-- Epic 41 (Epic G.1) — OrgDashboardWidget
-- ═══════════════════════════════════════════════════════════════════
--
-- Persisted, per-organization widget composition for the org-level
-- dashboard at /org/[orgSlug]. See prisma/schema/auth.prisma::
-- OrgDashboardWidget for the model docstring.
--
-- This migration is IDEMPOTENT — safe to re-run.
--
-- NOTE on schema-DB drift: the `ALTER COLUMN … DROP NOT NULL` diffs
-- that prisma-migrate emits for User / AuditorAccount /
-- UserIdentityLink across every recent migration are intentionally
-- NOT included here. Same GAP-21 pii-hash-not-null guardrail
-- enforced by `tests/guardrails/pii-hash-not-null.test.ts`.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1) Enum: OrgDashboardWidgetType ───────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrgDashboardWidgetType') THEN
        CREATE TYPE "OrgDashboardWidgetType" AS ENUM (
            'KPI',
            'DONUT',
            'TREND',
            'TENANT_LIST',
            'DRILLDOWN_CTAS'
        );
    END IF;
END
$$;

-- ─── 2) Table: OrgDashboardWidget ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "OrgDashboardWidget" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type"           "OrgDashboardWidgetType" NOT NULL,
    "chartType"      TEXT NOT NULL,
    "title"          TEXT,
    "config"         JSONB NOT NULL,
    "position"       JSONB NOT NULL,
    "size"           JSONB NOT NULL,
    "enabled"        BOOLEAN NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgDashboardWidget_pkey" PRIMARY KEY ("id")
);

-- ─── 3) Indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "OrgDashboardWidget_organizationId_idx"
    ON "OrgDashboardWidget"("organizationId");

-- ─── 4) Foreign keys ───────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'OrgDashboardWidget_organizationId_fkey'
    ) THEN
        ALTER TABLE "OrgDashboardWidget"
            ADD CONSTRAINT "OrgDashboardWidget_organizationId_fkey"
            FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

SELECT 'OrgDashboardWidget created — Epic 41 backend foundation ready' AS result;
