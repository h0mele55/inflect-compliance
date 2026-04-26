-- ═══════════════════════════════════════════════════════════════════
-- Epic O-1 — RLS for the hub-and-spoke organization layer
-- ═══════════════════════════════════════════════════════════════════
--
-- Two new tables landed in 20260426054428_add_organization_layer:
-- `Organization` and `OrgMembership`. Neither carries a `tenantId`
-- column, so neither is picked up by the tenant-scoped RLS regime
-- (`tenant_isolation` keyed on `current_setting('app.tenant_id')`).
--
-- They DO need isolation though — the Organization row leaks the
-- whole org slug + name + member count to anyone who can query the
-- table; OrgMembership leaks the role of every user across orgs they
-- don't belong to. Both are user-scoped: the unit of isolation is
-- "is the requesting user a member of this org?".
--
-- Design choices:
--
--   1. New session variable `app.user_id`. The Epic O-2 auth helper
--      (`getOrgCtx` / extension to `runInTenantContext`) will set
--      this alongside `app.tenant_id`. Until O-2 lands, no app-level
--      caller passes through this code path — `app_user` queries
--      against these tables return zero rows (fail-closed), exactly
--      what we want during the gap between schema rollout and auth
--      rollout.
--
--   2. Policy on `Organization` uses an EXISTS subquery against
--      `OrgMembership`. Performance: with the per-(org, user) unique
--      index this is O(1) per row, and dashboards typically iterate
--      O(orgs-the-user-belongs-to) ≤ 1 in the common case.
--
--   3. Policy on `OrgMembership` is the simplest "own-rows" form
--      (`userId = current_setting('app.user_id')`). ORG_ADMIN's
--      "list all members of my org" UI runs through the global
--      Prisma client (postgres role) like every other admin
--      management surface — that path is gated by `requirePermission`
--      and `getOrgCtx` at the API layer, NOT by RLS.
--
--   4. Writes (creating an Organization, inserting OrgMembership
--      during invite redemption or auto-provisioning) all flow
--      through privileged code paths that run as `postgres`.
--      `superuser_bypass` covers them. The `app_user` policy is
--      USING-only (no WITH CHECK) — under FORCE ROW LEVEL SECURITY,
--      an `app_user` can read its own org rows but can never INSERT
--      or UPDATE because no permissive sibling policy gives it
--      WITH CHECK access. That's the correct default for the org
--      layer's mostly-readonly app_user posture.
--
--   5. `superuser_bypass` USING `current_setting('role') != 'app_user'`
--      is the canonical bypass. Migrations, seeds, the org CRUD API,
--      and the auto-provisioning service run under postgres and pass.
--      `app_user` is gated.
--
--   6. FORCE ROW LEVEL SECURITY makes the table owner subject to
--      RLS too — without it, the bypass-by-role design is moot
--      because postgres would skip RLS unconditionally.
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Organization ─────────────────────────────────────────────────

ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organization" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation     ON "Organization";
DROP POLICY IF EXISTS superuser_bypass  ON "Organization";

-- Visible to an `app_user` only when they hold an OrgMembership in
-- this org. The EXISTS subquery is itself subject to RLS, but the
-- OrgMembership policy below filters to the requester's own rows —
-- so the subquery resolves to "does the requester have a membership
-- row pointing at this Organization", which is the intended check.
CREATE POLICY org_isolation ON "Organization"
    USING (
        EXISTS (
            SELECT 1
            FROM "OrgMembership" om
            WHERE om."organizationId" = "Organization".id
              AND om."userId" = current_setting('app.user_id', true)::text
        )
    );

-- Privileged paths (migrations, org-create API, auto-provisioning,
-- seeds) run as `postgres` and bypass.
CREATE POLICY superuser_bypass ON "Organization"
    USING (current_setting('role') != 'app_user');

-- ─── OrgMembership ────────────────────────────────────────────────

ALTER TABLE "OrgMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrgMembership" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_membership_self_isolation ON "OrgMembership";
DROP POLICY IF EXISTS superuser_bypass              ON "OrgMembership";

-- Each user reads only their own membership rows. Listing all members
-- of an org for the admin UI runs through the global Prisma client
-- (postgres role); that surface is permission-gated at the API layer.
CREATE POLICY org_membership_self_isolation ON "OrgMembership"
    USING ("userId" = current_setting('app.user_id', true)::text);

CREATE POLICY superuser_bypass ON "OrgMembership"
    USING (current_setting('role') != 'app_user');
