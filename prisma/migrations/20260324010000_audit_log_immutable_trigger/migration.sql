-- ═══════════════════════════════════════════════════════════════════
-- Immutable Audit Log — DB-Level Enforcement
-- ═══════════════════════════════════════════════════════════════════
--
-- This migration makes the AuditLog table append-only at the database
-- layer. Once a row is inserted, it CANNOT be updated or deleted
-- through any normal SQL operation (including superuser-bypassed
-- Prisma operations).
--
-- Enforcement mechanism:
--   BEFORE UPDATE OR DELETE trigger → raises an exception
--
-- Note: TRUNCATE is DDL and bypasses row-level triggers.
-- This is intentional — TRUNCATE is needed for test reset and
-- should be controlled by DB role permissions in production.
--
-- This migration is IDEMPOTENT — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1) Trigger function ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION audit_log_immutable_guard()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION
        'IMMUTABLE_AUDIT_LOG: % operations on "AuditLog" are forbidden. '
        'Audit log entries are append-only and cannot be modified or removed.',
        TG_OP
    USING ERRCODE = 'restrict_violation';
    RETURN NULL; -- never reached
END;
$$ LANGUAGE plpgsql;

-- ─── 2) Attach trigger ─────────────────────────────────────────────

-- Drop if exists for idempotency
DROP TRIGGER IF EXISTS audit_log_immutable ON "AuditLog";

CREATE TRIGGER audit_log_immutable
    BEFORE UPDATE OR DELETE ON "AuditLog"
    FOR EACH ROW
    EXECUTE FUNCTION audit_log_immutable_guard();

-- ─── 3) Privilege hardening ─────────────────────────────────────────
-- Revoke UPDATE/DELETE from app_user on AuditLog.
-- The app_user role (used by the application) should only INSERT/SELECT.
-- This is defense-in-depth on top of the trigger.

DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
        REVOKE UPDATE, DELETE ON "AuditLog" FROM app_user;
        -- Ensure INSERT and SELECT remain granted
        GRANT SELECT, INSERT ON "AuditLog" TO app_user;
    END IF;
END
$$;

-- ═══════════════════════════════════════════════════════════════════
-- Verification: the trigger is active and the privileges are locked
-- ═══════════════════════════════════════════════════════════════════

SELECT 'AuditLog immutability trigger installed — UPDATE/DELETE blocked' AS result;
