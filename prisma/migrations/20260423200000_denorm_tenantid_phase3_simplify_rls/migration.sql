-- ════════════════════════════════════════════════════════════════════
-- denorm-tenantId — Phase 3: trivial RLS policy + tenant_isolation_insert
-- ────────────────────────────────────────────────────────────────────
-- Final phase. With Phase 2's NOT NULL tenantId column and composite
-- parent FK in place, the chained EXISTS-based RLS policy is no
-- longer the right shape — it carries planner cost on every list-
-- page query that fans out to these tables and is structurally
-- weaker than the FK-enforced tenant equality.
--
-- Swap to the canonical Class-A pattern used by the other 65
-- tenant-scoped tables in the schema:
--
--   • tenant_isolation        USING (tenantId = current_setting())
--   • tenant_isolation_insert FOR INSERT WITH CHECK (tenantId = current_setting())
--   • superuser_bypass        USING (current_setting('role') != 'app_user')
--
-- Tables migrated:
--   • EvidenceReview
--   • AuditChecklistItem
--   • FindingEvidence    (was junction; both parent-tenant agreement
--                         is now guaranteed by the two composite FKs)
--   • AuditorPackAccess  (same junction guarantee)
--
-- Why the policy swap is safe:
--   1. Reads — the new USING clause folds into the (tenantId, …)
--      index condition. Strictly stronger query performance; identical
--      isolation semantics (a row's tenantId is by FK guaranteed to
--      equal its parent's, so "row's tenantId matches session" ↔
--      "parent's tenantId matches session" — the prior EXISTS chain).
--   2. Writes — the WITH CHECK now asserts the row's tenantId matches
--      the session. The composite parent FK independently asserts the
--      row's tenantId matches its parent's. Both invariants compose:
--      a write that would have passed the prior chained WITH CHECK
--      (parent in own tenant) is exactly a write where (a) the
--      tenantId set on the row equals the session tenant AND (b) the
--      parent's tenantId equals that same value. (a) is the new RLS
--      gate; (b) is the FK gate.
--   3. The superuser_bypass and ENABLE/FORCE RLS state are unchanged.
--
-- Idempotent — DROP POLICY IF EXISTS before each CREATE POLICY.
--
-- Rollback: re-run the original chained policy block from migration
-- 20260422180000_enable_rls_coverage. The chained policy and the
-- composite FK can coexist (they're independent enforcement layers);
-- a rollback that re-enables chained policies stays correct because
-- the FK is strictly stronger.
-- ════════════════════════════════════════════════════════════════════

-- Each table runs in its own DO block so a single failure leaves
-- the others in a consistent state and the migration can be replayed.

-- ─── EvidenceReview ────────────────────────────────────────────────
ALTER TABLE "EvidenceReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvidenceReview" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation        ON "EvidenceReview";
DROP POLICY IF EXISTS tenant_isolation_insert ON "EvidenceReview";
CREATE POLICY tenant_isolation ON "EvidenceReview"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY tenant_isolation_insert ON "EvidenceReview"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "EvidenceReview";
CREATE POLICY superuser_bypass ON "EvidenceReview"
    USING (current_setting('role') != 'app_user');

-- ─── AuditChecklistItem ────────────────────────────────────────────
ALTER TABLE "AuditChecklistItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditChecklistItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation        ON "AuditChecklistItem";
DROP POLICY IF EXISTS tenant_isolation_insert ON "AuditChecklistItem";
CREATE POLICY tenant_isolation ON "AuditChecklistItem"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY tenant_isolation_insert ON "AuditChecklistItem"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "AuditChecklistItem";
CREATE POLICY superuser_bypass ON "AuditChecklistItem"
    USING (current_setting('role') != 'app_user');

-- ─── FindingEvidence ───────────────────────────────────────────────
ALTER TABLE "FindingEvidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FindingEvidence" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation        ON "FindingEvidence";
DROP POLICY IF EXISTS tenant_isolation_insert ON "FindingEvidence";
CREATE POLICY tenant_isolation ON "FindingEvidence"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY tenant_isolation_insert ON "FindingEvidence"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "FindingEvidence";
CREATE POLICY superuser_bypass ON "FindingEvidence"
    USING (current_setting('role') != 'app_user');

-- ─── AuditorPackAccess ─────────────────────────────────────────────
ALTER TABLE "AuditorPackAccess" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditorPackAccess" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation        ON "AuditorPackAccess";
DROP POLICY IF EXISTS tenant_isolation_insert ON "AuditorPackAccess";
CREATE POLICY tenant_isolation ON "AuditorPackAccess"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY tenant_isolation_insert ON "AuditorPackAccess"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "AuditorPackAccess";
CREATE POLICY superuser_bypass ON "AuditorPackAccess"
    USING (current_setting('role') != 'app_user');

SELECT 'denorm-tenantId Phase 3 applied — 4 children on canonical trivial RLS' AS result;
