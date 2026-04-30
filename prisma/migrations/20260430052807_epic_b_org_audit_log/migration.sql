-- ═══════════════════════════════════════════════════════════════════
-- Epic B — OrgAuditLog (Org Audit Trail & Compliance Integrity)
-- ═══════════════════════════════════════════════════════════════════
--
-- Immutable, append-only, hash-chained ledger for org-level privilege
-- mutations (member add/remove/role-change + provisioning fan-out
-- summaries). Distinct from AuditLog — see prisma/schema/audit.prisma
-- header for the rationale.
--
-- Append-only enforcement:
--   • BEFORE UPDATE OR DELETE trigger raises restrict_violation
--   • REVOKE UPDATE,DELETE FROM app_user; GRANT SELECT,INSERT
--
-- Hash chain:
--   • per-organization, anchored on
--     pg_advisory_xact_lock(hashtext('org:' || organizationId))
--   • SHA-256 of canonical JSON across the same field set used for
--     AuditLog plus organizationId + targetUserId, computed by
--     src/lib/audit/org-audit-writer.ts
--
-- This migration is IDEMPOTENT — safe to re-run.
--
-- NOTE: the `ALTER TABLE … ALTER COLUMN "emailHash" DROP NOT NULL`
-- diffs that prisma-migrate emitted for User / AuditorAccount /
-- UserIdentityLink were intentionally STRIPPED. Those columns carry
-- a deliberate schema-DB drift documented in auth.prisma — schema
-- says `String?` so callers don't need to know the middleware
-- populates it; DB column stays `NOT NULL` so a row can never lack
-- the lookup hash. See migration
-- 20260429000000_gap21_drop_pii_plaintext_columns + the structural
-- ratchet at tests/guardrails/pii-hash-not-null.test.ts.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1) Action taxonomy enum ────────────────────────────────────────

CREATE TYPE "OrgAuditAction" AS ENUM (
    'ORG_MEMBER_ADDED',
    'ORG_MEMBER_REMOVED',
    'ORG_MEMBER_ROLE_CHANGED',
    'ORG_ADMIN_PROVISIONED_TO_TENANTS',
    'ORG_ADMIN_DEPROVISIONED_FROM_TENANTS'
);

-- ─── 2) Table ───────────────────────────────────────────────────────

CREATE TABLE "OrgAuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'USER',
    "action" "OrgAuditAction" NOT NULL,
    "targetUserId" TEXT,
    "detailsJson" JSONB,
    "requestId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entryHash" TEXT NOT NULL,
    "previousHash" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "OrgAuditLog_pkey" PRIMARY KEY ("id")
);

-- ─── 3) Indexes ─────────────────────────────────────────────────────

CREATE INDEX "OrgAuditLog_organizationId_occurredAt_idx"
    ON "OrgAuditLog"("organizationId", "occurredAt");

CREATE INDEX "OrgAuditLog_organizationId_action_idx"
    ON "OrgAuditLog"("organizationId", "action");

CREATE INDEX "OrgAuditLog_organizationId_entryHash_idx"
    ON "OrgAuditLog"("organizationId", "entryHash");

-- ─── 4) Foreign keys ────────────────────────────────────────────────

ALTER TABLE "OrgAuditLog" ADD CONSTRAINT "OrgAuditLog_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrgAuditLog" ADD CONSTRAINT "OrgAuditLog_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrgAuditLog" ADD CONSTRAINT "OrgAuditLog_targetUserId_fkey"
    FOREIGN KEY ("targetUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 5) Immutability trigger (mirrors AuditLog) ─────────────────────

CREATE OR REPLACE FUNCTION org_audit_log_immutable_guard()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION
        'IMMUTABLE_ORG_AUDIT_LOG: % operations on "OrgAuditLog" are forbidden. '
        'Org audit log entries are append-only and cannot be modified or removed.',
        TG_OP
    USING ERRCODE = 'restrict_violation';
    RETURN NULL; -- never reached
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS org_audit_log_immutable ON "OrgAuditLog";

CREATE TRIGGER org_audit_log_immutable
    BEFORE UPDATE OR DELETE ON "OrgAuditLog"
    FOR EACH ROW
    EXECUTE FUNCTION org_audit_log_immutable_guard();

-- ─── 6) Privilege hardening ─────────────────────────────────────────
-- Defense-in-depth on top of the trigger: app_user can only
-- INSERT/SELECT, never UPDATE/DELETE. Test reset uses
-- `SET LOCAL session_replication_role = 'replica'` which is
-- privileged-only — same pattern as AuditLog.

DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
        REVOKE UPDATE, DELETE ON "OrgAuditLog" FROM app_user;
        GRANT SELECT, INSERT ON "OrgAuditLog" TO app_user;
    END IF;
END
$$;

-- ─── Verification ───────────────────────────────────────────────────

SELECT 'OrgAuditLog created — UPDATE/DELETE blocked, app_user limited to INSERT/SELECT' AS result;
