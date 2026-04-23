-- ═══════════════════════════════════════════════════════════════════
-- Epic D.1 — RLS for `UserSession` (nullable-tenant table)
-- ═══════════════════════════════════════════════════════════════════
--
-- `UserSession` is the operational record of every live JWT (Epic
-- C.3). Without RLS, any code path that accidentally routed a query
-- through `runInTenantContext` would expose cross-tenant session
-- metadata (ipAddress, userAgent, sessionId, lastActiveAt) — a
-- privacy event for the affected users and a session-takedown vector
-- on the DELETE side.
--
-- Why the single-policy form (USING + WITH CHECK on one policy):
--   `tenantId` is nullable. The standard Class-A pattern uses two
--   permissive policies (`tenant_isolation` FOR ALL + a separate
--   `tenant_isolation_insert` FOR INSERT WITH CHECK). If we wanted
--   to additionally permit NULL-tenant reads — the operational
--   reality, since `recordNewSession` may run before tenant
--   resolution — we'd add a third permissive policy with
--   `USING (tenantId IS NULL)`. Postgres OR's permissive policies
--   on the same command, and a permissive policy without WITH CHECK
--   implicitly grants WITH CHECK (true) on UPDATE for visible rows.
--   Net effect: an `app_user`-bound session could UPDATE a NULL-
--   tenant row to ANY tenantId. That's the leak.
--
--   Combining the asymmetric USING (NULL OR own) with the strict
--   WITH CHECK (own) on a SINGLE policy guarantees the read-filter
--   and write-filter are evaluated as the same policy's two halves,
--   with no permissive sibling to OR with. Same shape proven on
--   `IntegrationWebhookEvent` (see prior migration's Section 2).
--
-- Compatibility:
--   * Session variable: `app.tenant_id` (matches every prior RLS
--     migration + `runInTenantContext`).
--   * Role model: `app_user` for tenant-scoped sessions; `postgres`
--     (table owner) for migrations, sign-in inserts, admin reads.
--     `superuser_bypass` USING (current_setting('role') != 'app_user')
--     gates the bypass on the explicit `SET LOCAL ROLE` choice.
--   * FORCE ROW LEVEL SECURITY makes the table owner subject to
--     RLS too — without it, the bypass-by-role design is moot
--     because postgres would skip RLS unconditionally.
--   * Grants: `app_user` already holds table privileges via
--     `prisma/init-roles.sh` (per-table grant + ALTER DEFAULT
--     PRIVILEGES on schema `public`). No per-migration grant needed.
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE "UserSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserSession" FORCE ROW LEVEL SECURITY;

-- The asymmetric tenant policy. NULL-tenant rows visible (legitimate
-- pre-tenant-resolution sign-in state); writes strictly own-tenant.
DROP POLICY IF EXISTS tenant_isolation        ON "UserSession";
DROP POLICY IF EXISTS tenant_isolation_insert ON "UserSession";
CREATE POLICY tenant_isolation ON "UserSession"
    USING (
        "tenantId" IS NULL
        OR "tenantId" = current_setting('app.tenant_id', true)::text
    )
    WITH CHECK (
        "tenantId" = current_setting('app.tenant_id', true)::text
    );

-- Operational bypass: migrations, the sign-in INSERT (which runs
-- under postgres because `recordNewSession` doesn't enter
-- `runInTenantContext`), admin reads/revocations from the global
-- Prisma client, and seed/test fixtures all run as `postgres`. The
-- bypass policy fires only when the role has NOT been switched to
-- `app_user`, i.e. only on the privileged paths.
DROP POLICY IF EXISTS superuser_bypass ON "UserSession";
CREATE POLICY superuser_bypass ON "UserSession"
    USING (current_setting('role') != 'app_user');
