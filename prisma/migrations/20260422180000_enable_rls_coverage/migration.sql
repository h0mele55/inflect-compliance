-- ═══════════════════════════════════════════════════════════════════
-- Epic A.1 — Row-Level Security Coverage Extension
-- ═══════════════════════════════════════════════════════════════════
--
-- Closes the tenant-isolation gap identified by the Epic A.1 schema
-- audit. After this migration:
--
--   * 14 tenant-scoped tables that previously had NO RLS gain the
--     canonical `tenant_isolation` + `tenant_isolation_insert` +
--     `superuser_bypass` trio.
--   * 1 nullable-tenant table (IntegrationWebhookEvent) gets a
--     Control-style policy set that accepts NULL on ingest and
--     enforces own-tenant match post-identification.
--   * 6 ownership-chained tables replace their `USING(true) WITH CHECK(true)`
--     stopgap policies (from prisma/rls-fix.sql) with real EXISTS
--     policies against their tenant-scoped parents.
--
-- Session variable: `app.tenant_id`
--   We deliberately reuse the existing session variable name rather
--   than rename to `app.current_tenant_id`. Every prior RLS migration,
--   `src/lib/db-context.ts::runInTenantContext`, and 51 in-force
--   policies use `app.tenant_id`. Renaming would require a coordinated
--   change across those call sites with zero security benefit —
--   the name is an implementation detail, the enforcement model is
--   the contract.
--
-- Role model (unchanged from 20260323180000_apply_full_rls_setup):
--   app_user — NOLOGIN role; RLS policies bite.
--   postgres — superuser; `superuser_bypass` policy permits.
--   runInTenantContext calls `SET LOCAL ROLE app_user` to drop superuser
--   power within the transaction; `superuser_bypass` uses
--   `current_setting('role') != 'app_user'` to allow all other paths.
--
-- Fully IDEMPOTENT — safe to re-run. Uses DROP POLICY IF EXISTS before
-- every CREATE.
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- SECTION 1 — Direct `tenantId` tables (Class A)
-- ═══════════════════════════════════════════════════════════════════
--
-- Pattern, applied uniformly to every table in this section:
--
--   ALTER TABLE "X" ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE "X" FORCE ROW LEVEL SECURITY;
--
--   CREATE POLICY tenant_isolation ON "X"
--       USING ("tenantId" = current_setting('app.tenant_id', true)::text);
--
--   CREATE POLICY tenant_isolation_insert ON "X"
--       FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
--
--   CREATE POLICY superuser_bypass ON "X"
--       USING (current_setting('role') != 'app_user');
--
-- The `tenant_isolation` policy handles SELECT/UPDATE/DELETE. When
-- WITH CHECK is unspecified on an ALL policy, the USING predicate
-- doubles as WITH CHECK for UPDATE — so mutating a row to another
-- tenant's id is also blocked. INSERT is covered by the dedicated
-- `tenant_isolation_insert` policy.
--
-- Permissive policy semantics: the three policies OR together. Under
-- `app_user`, superuser_bypass is false, so only tenant_isolation
-- gates the row. Under any other role, superuser_bypass is true and
-- the row is visible/writable — this is the migration/seed/auth path.

-- ── TenantCustomRole ───────────────────────────────────────────────
ALTER TABLE "TenantCustomRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantCustomRole" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TenantCustomRole";
CREATE POLICY tenant_isolation ON "TenantCustomRole"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "TenantCustomRole";
CREATE POLICY tenant_isolation_insert ON "TenantCustomRole"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "TenantCustomRole";
CREATE POLICY superuser_bypass ON "TenantCustomRole"
    USING (current_setting('role') != 'app_user');

-- ── TenantApiKey ───────────────────────────────────────────────────
ALTER TABLE "TenantApiKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantApiKey" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TenantApiKey";
CREATE POLICY tenant_isolation ON "TenantApiKey"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "TenantApiKey";
CREATE POLICY tenant_isolation_insert ON "TenantApiKey"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "TenantApiKey";
CREATE POLICY superuser_bypass ON "TenantApiKey"
    USING (current_setting('role') != 'app_user');

-- ── TenantIdentityProvider (SSO config) ────────────────────────────
ALTER TABLE "TenantIdentityProvider" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantIdentityProvider" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TenantIdentityProvider";
CREATE POLICY tenant_isolation ON "TenantIdentityProvider"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "TenantIdentityProvider";
CREATE POLICY tenant_isolation_insert ON "TenantIdentityProvider"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "TenantIdentityProvider";
CREATE POLICY superuser_bypass ON "TenantIdentityProvider"
    USING (current_setting('role') != 'app_user');

-- ── UserIdentityLink (User↔IdP mapping) ────────────────────────────
ALTER TABLE "UserIdentityLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserIdentityLink" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "UserIdentityLink";
CREATE POLICY tenant_isolation ON "UserIdentityLink"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "UserIdentityLink";
CREATE POLICY tenant_isolation_insert ON "UserIdentityLink"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "UserIdentityLink";
CREATE POLICY superuser_bypass ON "UserIdentityLink"
    USING (current_setting('role') != 'app_user');

-- ── TenantSecuritySettings (1:1 MFA policy) ────────────────────────
ALTER TABLE "TenantSecuritySettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantSecuritySettings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TenantSecuritySettings";
CREATE POLICY tenant_isolation ON "TenantSecuritySettings"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "TenantSecuritySettings";
CREATE POLICY tenant_isolation_insert ON "TenantSecuritySettings"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "TenantSecuritySettings";
CREATE POLICY superuser_bypass ON "TenantSecuritySettings"
    USING (current_setting('role') != 'app_user');

-- ── UserMfaEnrollment (TOTP secrets — elevated sensitivity) ────────
ALTER TABLE "UserMfaEnrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserMfaEnrollment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "UserMfaEnrollment";
CREATE POLICY tenant_isolation ON "UserMfaEnrollment"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "UserMfaEnrollment";
CREATE POLICY tenant_isolation_insert ON "UserMfaEnrollment"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "UserMfaEnrollment";
CREATE POLICY superuser_bypass ON "UserMfaEnrollment"
    USING (current_setting('role') != 'app_user');

-- ── TenantInvite (pending memberships) ─────────────────────────────
ALTER TABLE "TenantInvite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantInvite" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TenantInvite";
CREATE POLICY tenant_isolation ON "TenantInvite"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "TenantInvite";
CREATE POLICY tenant_isolation_insert ON "TenantInvite"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "TenantInvite";
CREATE POLICY superuser_bypass ON "TenantInvite"
    USING (current_setting('role') != 'app_user');

-- ── TenantScimToken (SCIM provisioning secrets — elevated) ─────────
ALTER TABLE "TenantScimToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantScimToken" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TenantScimToken";
CREATE POLICY tenant_isolation ON "TenantScimToken"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "TenantScimToken";
CREATE POLICY tenant_isolation_insert ON "TenantScimToken"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "TenantScimToken";
CREATE POLICY superuser_bypass ON "TenantScimToken"
    USING (current_setting('role') != 'app_user');

-- ── IntegrationConnection (encrypted OAuth/API creds — elevated) ───
ALTER TABLE "IntegrationConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntegrationConnection" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "IntegrationConnection";
CREATE POLICY tenant_isolation ON "IntegrationConnection"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "IntegrationConnection";
CREATE POLICY tenant_isolation_insert ON "IntegrationConnection"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "IntegrationConnection";
CREATE POLICY superuser_bypass ON "IntegrationConnection"
    USING (current_setting('role') != 'app_user');

-- ── IntegrationExecution (append-only check history) ───────────────
ALTER TABLE "IntegrationExecution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntegrationExecution" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "IntegrationExecution";
CREATE POLICY tenant_isolation ON "IntegrationExecution"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "IntegrationExecution";
CREATE POLICY tenant_isolation_insert ON "IntegrationExecution"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "IntegrationExecution";
CREATE POLICY superuser_bypass ON "IntegrationExecution"
    USING (current_setting('role') != 'app_user');

-- ── IntegrationSyncMapping (local↔remote entity graph) ─────────────
ALTER TABLE "IntegrationSyncMapping" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntegrationSyncMapping" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "IntegrationSyncMapping";
CREATE POLICY tenant_isolation ON "IntegrationSyncMapping"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "IntegrationSyncMapping";
CREATE POLICY tenant_isolation_insert ON "IntegrationSyncMapping"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "IntegrationSyncMapping";
CREATE POLICY superuser_bypass ON "IntegrationSyncMapping"
    USING (current_setting('role') != 'app_user');

-- ── ComplianceSnapshot (KPI time-series) ───────────────────────────
ALTER TABLE "ComplianceSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComplianceSnapshot" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ComplianceSnapshot";
CREATE POLICY tenant_isolation ON "ComplianceSnapshot"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "ComplianceSnapshot";
CREATE POLICY tenant_isolation_insert ON "ComplianceSnapshot"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "ComplianceSnapshot";
CREATE POLICY superuser_bypass ON "ComplianceSnapshot"
    USING (current_setting('role') != 'app_user');

-- ── AutomationRule (Epic 60 foundation) ────────────────────────────
ALTER TABLE "AutomationRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationRule" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AutomationRule";
CREATE POLICY tenant_isolation ON "AutomationRule"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "AutomationRule";
CREATE POLICY tenant_isolation_insert ON "AutomationRule"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "AutomationRule";
CREATE POLICY superuser_bypass ON "AutomationRule"
    USING (current_setting('role') != 'app_user');

-- ── AutomationExecution (Epic 60 append-only dispatch log) ─────────
ALTER TABLE "AutomationExecution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationExecution" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AutomationExecution";
CREATE POLICY tenant_isolation ON "AutomationExecution"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "AutomationExecution";
CREATE POLICY tenant_isolation_insert ON "AutomationExecution"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "AutomationExecution";
CREATE POLICY superuser_bypass ON "AutomationExecution"
    USING (current_setting('role') != 'app_user');

-- ═══════════════════════════════════════════════════════════════════
-- SECTION 2 — Nullable `tenantId` (Class C)
-- ═══════════════════════════════════════════════════════════════════
--
-- IntegrationWebhookEvent carries a NULL tenantId at ingest time
-- because inbound webhooks are received before the tenant is
-- identified (signature verification + mapping happens after the
-- insert). Post-identification, a background job backfills tenantId.
--
-- Policy asymmetry is deliberate:
--
--   USING      — tenants see rows that are either NULL-tenant (not
--                yet identified) OR match their own tenantId. In
--                practice the app path filters to own-tenant rows
--                via Prisma; the NULL-tenant path exists so
--                post-ingest backfill under `app_user` can find
--                its targets.
--
--   WITH CHECK — writes are strictly own-tenant. Only the webhook
--                ingest path (running under `postgres`, bypassed
--                via superuser_bypass) can insert NULL-tenant rows.
--                App code updating the row to identify its tenant
--                must set tenantId to its own; cross-tenant reassign
--                is blocked.

-- CRITICAL: Class C uses a SINGLE permissive policy with both USING
-- and WITH CHECK specified. Splitting into two policies (one FOR ALL
-- USING permissive, one FOR INSERT WITH CHECK strict) lets NULL-tenant
-- INSERTs slip through: the FOR ALL policy's USING doubles as WITH
-- CHECK for INSERT (Postgres default behaviour), permissive policies
-- OR together, and the permissive USING admits NULL → NULL passes.
--
-- Single-policy form makes USING and WITH CHECK asymmetric explicitly:
--   USING:     NULL OR own-tenant (reads see unidentified events)
--   WITH CHECK: own-tenant only  (writes cannot create NULL-tenant rows
--                                 from app_user context)

ALTER TABLE "IntegrationWebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntegrationWebhookEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "IntegrationWebhookEvent";
DROP POLICY IF EXISTS tenant_isolation_insert ON "IntegrationWebhookEvent";
CREATE POLICY tenant_isolation ON "IntegrationWebhookEvent"
    USING (
        "tenantId" IS NULL
        OR "tenantId" = current_setting('app.tenant_id', true)::text
    )
    WITH CHECK (
        "tenantId" = current_setting('app.tenant_id', true)::text
    );
DROP POLICY IF EXISTS superuser_bypass ON "IntegrationWebhookEvent";
CREATE POLICY superuser_bypass ON "IntegrationWebhookEvent"
    USING (current_setting('role') != 'app_user');

-- ═══════════════════════════════════════════════════════════════════
-- SECTION 3 — Ownership-chained tables (Class E) — replace stopgaps
-- ═══════════════════════════════════════════════════════════════════
--
-- These tables have no `tenantId` column and today carry a
-- `USING(true) WITH CHECK(true)` "allow_all" placeholder that
-- provides ZERO tenant isolation. We replace each with an EXISTS
-- policy against the parent table's tenantId.
--
-- Single-policy shape (USING + WITH CHECK in one CREATE):
--   Using two separate permissive policies — one `FOR ALL USING` with
--   the read-side EXISTS and one `FOR INSERT WITH CHECK` with the
--   stricter multi-parent EXISTS — would permit an INSERT that
--   satisfies ONLY the first policy's USING (doubling as WITH CHECK
--   when unspecified). For junction tables that must check BOTH
--   parents on write, this leaks.
--
-- We therefore follow the precedent set by PolicyControlLink in
-- prisma/rls-fix.sql: one permissive policy that specifies both
-- USING and WITH CHECK explicitly.

-- ── EvidenceReview (child of Evidence) ─────────────────────────────
--
-- Single parent. USING and WITH CHECK are identical: the parent
-- Evidence row must belong to the current tenant.

ALTER TABLE "EvidenceReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvidenceReview" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "EvidenceReview";
DROP POLICY IF EXISTS tenant_isolation ON "EvidenceReview";
DROP POLICY IF EXISTS tenant_isolation_insert ON "EvidenceReview";
CREATE POLICY tenant_isolation ON "EvidenceReview"
    USING (
        EXISTS (
            SELECT 1 FROM "Evidence" e
            WHERE e.id = "evidenceId"
              AND e."tenantId" = current_setting('app.tenant_id', true)::text
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "Evidence" e
            WHERE e.id = "evidenceId"
              AND e."tenantId" = current_setting('app.tenant_id', true)::text
        )
    );
DROP POLICY IF EXISTS superuser_bypass ON "EvidenceReview";
CREATE POLICY superuser_bypass ON "EvidenceReview"
    USING (current_setting('role') != 'app_user');

-- ── PolicyApproval (child of Policy + PolicyVersion) ───────────────
--
-- USING checks Policy alone (cheapest correct read-side gate);
-- WITH CHECK additionally verifies PolicyVersion to prevent insert
-- of an approval that pairs a tenant's policy with another tenant's
-- version (cross-tenant snapshot smuggling).

ALTER TABLE "PolicyApproval" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyApproval" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "PolicyApproval";
DROP POLICY IF EXISTS tenant_isolation ON "PolicyApproval";
DROP POLICY IF EXISTS tenant_isolation_insert ON "PolicyApproval";
CREATE POLICY tenant_isolation ON "PolicyApproval"
    USING (
        EXISTS (
            SELECT 1 FROM "Policy" p
            WHERE p.id = "policyId"
              AND p."tenantId" = current_setting('app.tenant_id', true)::text
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "Policy" p
            WHERE p.id = "policyId"
              AND p."tenantId" = current_setting('app.tenant_id', true)::text
        )
        AND
        EXISTS (
            SELECT 1 FROM "PolicyVersion" pv
            WHERE pv.id = "policyVersionId"
              AND pv."tenantId" = current_setting('app.tenant_id', true)::text
        )
    );
DROP POLICY IF EXISTS superuser_bypass ON "PolicyApproval";
CREATE POLICY superuser_bypass ON "PolicyApproval"
    USING (current_setting('role') != 'app_user');

-- ── PolicyAcknowledgement (child of PolicyVersion) ─────────────────
--
-- Single parent. A user row on PolicyAcknowledgement is tenant-scoped
-- via PolicyVersion.tenantId — we do NOT need to cross-check the
-- user's tenant here because PolicyVersion ownership is the
-- authority (a user could be a member of multiple tenants, each
-- acknowledging their own policies).

ALTER TABLE "PolicyAcknowledgement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyAcknowledgement" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "PolicyAcknowledgement";
DROP POLICY IF EXISTS tenant_isolation ON "PolicyAcknowledgement";
DROP POLICY IF EXISTS tenant_isolation_insert ON "PolicyAcknowledgement";
CREATE POLICY tenant_isolation ON "PolicyAcknowledgement"
    USING (
        EXISTS (
            SELECT 1 FROM "PolicyVersion" pv
            WHERE pv.id = "policyVersionId"
              AND pv."tenantId" = current_setting('app.tenant_id', true)::text
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "PolicyVersion" pv
            WHERE pv.id = "policyVersionId"
              AND pv."tenantId" = current_setting('app.tenant_id', true)::text
        )
    );
DROP POLICY IF EXISTS superuser_bypass ON "PolicyAcknowledgement";
CREATE POLICY superuser_bypass ON "PolicyAcknowledgement"
    USING (current_setting('role') != 'app_user');

-- ── AuditChecklistItem (child of Audit) ────────────────────────────
--
-- Single parent. Standard EXISTS-on-parent pattern.

ALTER TABLE "AuditChecklistItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditChecklistItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "AuditChecklistItem";
DROP POLICY IF EXISTS tenant_isolation ON "AuditChecklistItem";
DROP POLICY IF EXISTS tenant_isolation_insert ON "AuditChecklistItem";
CREATE POLICY tenant_isolation ON "AuditChecklistItem"
    USING (
        EXISTS (
            SELECT 1 FROM "Audit" a
            WHERE a.id = "auditId"
              AND a."tenantId" = current_setting('app.tenant_id', true)::text
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "Audit" a
            WHERE a.id = "auditId"
              AND a."tenantId" = current_setting('app.tenant_id', true)::text
        )
    );
DROP POLICY IF EXISTS superuser_bypass ON "AuditChecklistItem";
CREATE POLICY superuser_bypass ON "AuditChecklistItem"
    USING (current_setting('role') != 'app_user');

-- ── FindingEvidence (junction: Finding × Evidence) ─────────────────
--
-- Junction table with two tenant-scoped parents. Writes must check
-- BOTH; otherwise a tenant could link its own Finding to another
-- tenant's Evidence. USING can be cheaper (single parent check) —
-- Finding is the "owner" for read purposes.

ALTER TABLE "FindingEvidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FindingEvidence" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "FindingEvidence";
DROP POLICY IF EXISTS tenant_isolation ON "FindingEvidence";
DROP POLICY IF EXISTS tenant_isolation_insert ON "FindingEvidence";
CREATE POLICY tenant_isolation ON "FindingEvidence"
    USING (
        EXISTS (
            SELECT 1 FROM "Finding" f
            WHERE f.id = "findingId"
              AND f."tenantId" = current_setting('app.tenant_id', true)::text
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "Finding" f
            WHERE f.id = "findingId"
              AND f."tenantId" = current_setting('app.tenant_id', true)::text
        )
        AND
        EXISTS (
            SELECT 1 FROM "Evidence" e
            WHERE e.id = "evidenceId"
              AND e."tenantId" = current_setting('app.tenant_id', true)::text
        )
    );
DROP POLICY IF EXISTS superuser_bypass ON "FindingEvidence";
CREATE POLICY superuser_bypass ON "FindingEvidence"
    USING (current_setting('role') != 'app_user');

-- ── AuditorPackAccess (junction: AuditorAccount × AuditPack) ───────
--
-- Junction table with two tenant-scoped parents. Same pattern as
-- FindingEvidence — both parents must belong to the current tenant
-- for a write to succeed.

ALTER TABLE "AuditorPackAccess" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditorPackAccess" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "AuditorPackAccess";
DROP POLICY IF EXISTS tenant_isolation ON "AuditorPackAccess";
DROP POLICY IF EXISTS tenant_isolation_insert ON "AuditorPackAccess";
CREATE POLICY tenant_isolation ON "AuditorPackAccess"
    USING (
        EXISTS (
            SELECT 1 FROM "AuditPack" ap
            WHERE ap.id = "auditPackId"
              AND ap."tenantId" = current_setting('app.tenant_id', true)::text
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "AuditPack" ap
            WHERE ap.id = "auditPackId"
              AND ap."tenantId" = current_setting('app.tenant_id', true)::text
        )
        AND
        EXISTS (
            SELECT 1 FROM "AuditorAccount" aa
            WHERE aa.id = "auditorId"
              AND aa."tenantId" = current_setting('app.tenant_id', true)::text
        )
    );
DROP POLICY IF EXISTS superuser_bypass ON "AuditorPackAccess";
CREATE POLICY superuser_bypass ON "AuditorPackAccess"
    USING (current_setting('role') != 'app_user');

-- ═══════════════════════════════════════════════════════════════════
-- Privilege grants for newly-covered tables
-- ═══════════════════════════════════════════════════════════════════
--
-- The original init-roles.sh grants `ALL PRIVILEGES ON ALL TABLES IN
-- SCHEMA public` to `app_user`, plus a `DEFAULT PRIVILEGES` rule for
-- future tables. That rule covers tables created by the role that
-- ran `ALTER DEFAULT PRIVILEGES` — in practice `postgres`. Since
-- Prisma migrations also run as postgres, new tables (AutomationRule,
-- ComplianceSnapshot, etc.) should already be grantable.
--
-- We re-issue the grant explicitly here for idempotent safety: if any
-- table was created under a different role or the default privileges
-- rule was modified, this catches it.

GRANT SELECT, INSERT, UPDATE, DELETE ON
    "TenantCustomRole",
    "TenantApiKey",
    "TenantIdentityProvider",
    "UserIdentityLink",
    "TenantSecuritySettings",
    "UserMfaEnrollment",
    "TenantInvite",
    "TenantScimToken",
    "IntegrationConnection",
    "IntegrationExecution",
    "IntegrationWebhookEvent",
    "IntegrationSyncMapping",
    "ComplianceSnapshot",
    "AutomationRule",
    "AutomationExecution",
    "EvidenceReview",
    "PolicyApproval",
    "PolicyAcknowledgement",
    "AuditChecklistItem",
    "FindingEvidence",
    "AuditorPackAccess"
TO app_user;

-- ═══════════════════════════════════════════════════════════════════
-- Verification
-- ═══════════════════════════════════════════════════════════════════

SELECT 'Epic A.1 RLS coverage extension applied — 21 tables covered' AS result;
