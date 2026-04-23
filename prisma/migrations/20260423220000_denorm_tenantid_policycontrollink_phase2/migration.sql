-- ════════════════════════════════════════════════════════════════════
-- denorm-tenantId — PolicyControlLink Phase 2: NOT NULL + composite FK
-- ────────────────────────────────────────────────────────────────────
-- Tightens Phase 1's nullable column into NOT NULL, swaps the
-- single-column Policy FK for the composite (policyId, tenantId) →
-- Policy(id, tenantId), and tightens the tenant FK from SET NULL to
-- RESTRICT.
--
-- The Control-side FK stays single-column. Control.tenantId is
-- intentionally nullable for library-derived global controls; a
-- composite FK would reject a tenant Policy linking to a global
-- Control. The pre-denorm chained RLS only walked via Policy
-- anyway, so the post-denorm structural protection matches it.
-- ════════════════════════════════════════════════════════════════════

-- ─── Defensive re-backfill ──────────────────────────────────────────

UPDATE "PolicyControlLink" pcl
SET    "tenantId" = p."tenantId"
FROM   "Policy" p
WHERE  p.id = pcl."policyId"
  AND  pcl."tenantId" IS NULL;

-- ─── Pre-flight: zero NULL tenantId ─────────────────────────────────

DO $$
DECLARE c BIGINT;
BEGIN
    SELECT count(*) INTO c FROM "PolicyControlLink" WHERE "tenantId" IS NULL;
    IF c > 0 THEN
        RAISE EXCEPTION 'PolicyControlLink: % NULL tenantId rows — Phase 2 cannot proceed (orphan FK?)', c;
    END IF;
END $$;

-- ─── Pre-flight: composite FK (Policy side only) ────────────────────

DO $$
DECLARE c BIGINT;
BEGIN
    SELECT count(*) INTO c FROM "PolicyControlLink" pcl
    LEFT JOIN "Policy" p ON p.id = pcl."policyId" AND p."tenantId" = pcl."tenantId"
    WHERE p.id IS NULL;
    IF c > 0 THEN
        RAISE EXCEPTION 'PolicyControlLink: % rows have policyId/tenantId pairs that do not match any Policy(id, tenantId)', c;
    END IF;
END $$;

-- ─── SET NOT NULL ───────────────────────────────────────────────────

ALTER TABLE "PolicyControlLink" ALTER COLUMN "tenantId" SET NOT NULL;

-- ─── Tighten tenant FK: SET NULL → RESTRICT ─────────────────────────

ALTER TABLE "PolicyControlLink" DROP CONSTRAINT IF EXISTS "PolicyControlLink_tenantId_fkey";
ALTER TABLE "PolicyControlLink" ADD  CONSTRAINT "PolicyControlLink_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Composite FK (policyId, tenantId) → Policy(id, tenantId) ───────
-- Replaces PolicyControlLink_policyId_fkey. Structural guarantee
-- that this row's tenantId equals its parent Policy's tenantId.

ALTER TABLE "PolicyControlLink" DROP CONSTRAINT IF EXISTS "PolicyControlLink_policyId_fkey";
ALTER TABLE "PolicyControlLink" ADD  CONSTRAINT "PolicyControlLink_policyId_tenantId_fkey"
    FOREIGN KEY ("policyId", "tenantId") REFERENCES "Policy"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Control-side FK is intentionally NOT touched: Control.tenantId is
-- nullable, so the existing single-column FK is the right shape.

SELECT 'PolicyControlLink Phase 2 applied — tenantId NOT NULL + composite Policy FK' AS result;
