-- ════════════════════════════════════════════════════════════════════
-- denorm-tenantId — PolicyControlLink Phase 3: trivial RLS
-- ────────────────────────────────────────────────────────────────────
-- Final phase. With Phase 2's NOT NULL tenantId column and composite
-- Policy FK in place, swap the chained EXISTS-based RLS policy for
-- the canonical Class-A form used by the rest of the schema.
--
-- Why safe (read path):
-- - The trivial USING folds into the (tenantId, …) index conditions
--   added in Phase 1. Strictly stronger query performance; identical
--   isolation semantics on reads (Phase 2's composite Policy FK
--   guarantees row.tenantId = policy.tenantId, so "row's tenantId
--   matches session" ↔ "policy's tenantId matches session" — the
--   prior EXISTS chain).
--
-- Write path subtlety — the Control side:
-- - Postgres FK validation runs with internal-superuser-equivalent
--   privileges and BYPASSES RLS on the referenced table. This means
--   the single-column Control FK on its own would let a tenant-A
--   session insert a PolicyControlLink whose controlId points to a
--   tenant-B Control (FK lookup succeeds because the bypass sees
--   all rows). The composite Policy FK closes the Policy side; the
--   trivial WITH CHECK closes the row.tenantId side; but neither
--   ties row.tenantId to control.tenantId.
-- - The original chained policy explicitly enforced BOTH parents in
--   WITH CHECK (see prisma/migrations/20260323180000_apply_full_rls_setup).
--   We preserve that Control-side check here. The fast-path read
--   benefit is unchanged; only INSERT pays the EXISTS cost, which
--   PCL writes are infrequent enough to absorb.
-- - Tenant-A linking to a global Control (Control.tenantId IS NULL)
--   stays allowed — the EXISTS clause permits NULL via the same
--   `(c.tenantId IS NULL OR c.tenantId = current_setting())`
--   shape used by the original policy.
-- ════════════════════════════════════════════════════════════════════

-- Important Postgres RLS subtlety: multiple PERMISSIVE policies are
-- combined with OR. So a strict permissive WITH CHECK can be defeated
-- by a looser permissive policy whose USING is reused as the implicit
-- WITH CHECK for INSERT. We use the standard permissive
-- tenant_isolation + tenant_isolation_insert pair (matching the rest
-- of the schema's shape, makes the rls-coverage guard happy), and
-- add a RESTRICTIVE policy for the Control-parent check. Restrictive
-- policies are AND'd with the OR of all permissives, so the Control
-- check can never be bypassed by the permissive tenant_isolation
-- policy's loose USING-as-implicit-WITH-CHECK.

ALTER TABLE "PolicyControlLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyControlLink" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation              ON "PolicyControlLink";
DROP POLICY IF EXISTS tenant_isolation_insert       ON "PolicyControlLink";
DROP POLICY IF EXISTS control_parent_tenant_check   ON "PolicyControlLink";

CREATE POLICY tenant_isolation ON "PolicyControlLink"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);

CREATE POLICY tenant_isolation_insert ON "PolicyControlLink"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- RESTRICTIVE: every INSERT must additionally satisfy this. The
-- referenced Control must belong to the current tenant OR be global
-- (NULL tenantId — library-derived controls).
CREATE POLICY control_parent_tenant_check ON "PolicyControlLink"
    AS RESTRICTIVE
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "Control" c
            WHERE c.id = "controlId"
              AND (c."tenantId" IS NULL
                   OR c."tenantId" = current_setting('app.tenant_id', true)::text)
        )
    );

DROP POLICY IF EXISTS superuser_bypass ON "PolicyControlLink";
CREATE POLICY superuser_bypass ON "PolicyControlLink"
    USING (current_setting('role') != 'app_user');

SELECT 'PolicyControlLink Phase 3 applied — trivial RLS in place' AS result;
