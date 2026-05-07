-- ═══════════════════════════════════════════════════════════════════
-- Epic G-5 — Control Exception Register.
--
-- One new tenant-scoped table modelling the formal exception
-- lifecycle: REQUESTED → (APPROVED | REJECTED) → (EXPIRED). Renewal
-- lineage is a per-row link via `renewedFromId` (composite FK so a
-- renewal can never reference a row in another tenant).
--
-- One new enum (ControlExceptionStatus).
--
-- Class-A direct-scoped RLS — canonical three-policy setup
--   tenant_isolation        (USING)
--   tenant_isolation_insert (FOR INSERT WITH CHECK)
--   superuser_bypass        (USING role != 'app_user')
-- plus FORCE ROW LEVEL SECURITY. Mirrors
-- 20260506000000_epic_g3_vendor_template_rls.
--
-- Schema-shape constraints (CHECK):
--   • An APPROVED row MUST carry approvedAt + approvedByUserId +
--     expiresAt — auditors need the full triple to verify
--     accountability.
--   • A REJECTED row MUST carry rejectedAt + rejectedByUserId.
--   • The rejection-reason CHECK pairs with the rejected timestamp:
--     once a row is REJECTED the operator may add reason text, but
--     non-rejected rows MUST NOT carry one.
--
-- Adding the composite unique `(id, tenantId)` to Control is purely
-- additive (the primary key already enforces id uniqueness; this
-- supports the composite-FK shape Prisma generates for
-- ControlException → Control). Mirrors the Audit / AccessReview
-- pattern.
-- ═══════════════════════════════════════════════════════════════════

-- ── Enum ───────────────────────────────────────────────────────────

CREATE TYPE "ControlExceptionStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'EXPIRED');

-- ── Composite parent key on Control ────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'Control_id_tenantId_key'
    ) THEN
        ALTER TABLE "Control"
            ADD CONSTRAINT "Control_id_tenantId_key" UNIQUE ("id", "tenantId");
    END IF;
END
$$;

-- ── Table ──────────────────────────────────────────────────────────

CREATE TABLE "ControlException" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "status" "ControlExceptionStatus" NOT NULL DEFAULT 'REQUESTED',
    "justification" TEXT NOT NULL,
    "compensatingControlId" TEXT,
    "riskAcceptedByUserId" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedByUserId" TEXT,
    "rejectionReason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "renewedFromId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,

    CONSTRAINT "ControlException_pkey" PRIMARY KEY ("id")
);

-- ── Composite parent key on ControlException itself ───────────────

CREATE UNIQUE INDEX "ControlException_id_tenantId_key" ON "ControlException"("id", "tenantId");

-- ── Indexes ────────────────────────────────────────────────────────

CREATE INDEX "ControlException_tenantId_status_idx" ON "ControlException"("tenantId", "status");
CREATE INDEX "ControlException_tenantId_expiresAt_idx" ON "ControlException"("tenantId", "expiresAt");
CREATE INDEX "ControlException_tenantId_controlId_idx" ON "ControlException"("tenantId", "controlId");
CREATE INDEX "ControlException_tenantId_deletedAt_idx" ON "ControlException"("tenantId", "deletedAt");
CREATE INDEX "ControlException_tenantId_createdAt_idx" ON "ControlException"("tenantId", "createdAt");
CREATE INDEX "ControlException_renewedFromId_idx" ON "ControlException"("renewedFromId");

-- ── Foreign keys ───────────────────────────────────────────────────

ALTER TABLE "ControlException"
    ADD CONSTRAINT "ControlException_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite FK — the affected control must live in the same tenant.
-- Cross-tenant exception registration is impossible by construction.
ALTER TABLE "ControlException"
    ADD CONSTRAINT "ControlException_controlId_tenantId_fkey"
    FOREIGN KEY ("controlId", "tenantId") REFERENCES "Control"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Compensating control — same composite shape so the optional
-- mitigating control is also tenant-pinned.
ALTER TABLE "ControlException"
    ADD CONSTRAINT "ControlException_compensatingControlId_tenantId_fkey"
    FOREIGN KEY ("compensatingControlId", "tenantId") REFERENCES "Control"("id", "tenantId")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Renewal lineage — self-referential composite FK. SetNull on cascade
-- so deleting the prior row doesn't shred the renewal record (the
-- audit log carries the lineage).
ALTER TABLE "ControlException"
    ADD CONSTRAINT "ControlException_renewedFromId_tenantId_fkey"
    FOREIGN KEY ("renewedFromId", "tenantId") REFERENCES "ControlException"("id", "tenantId")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- User FKs — actors per lifecycle slot.
ALTER TABLE "ControlException"
    ADD CONSTRAINT "ControlException_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ControlException"
    ADD CONSTRAINT "ControlException_riskAcceptedByUserId_fkey"
    FOREIGN KEY ("riskAcceptedByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ControlException"
    ADD CONSTRAINT "ControlException_approvedByUserId_fkey"
    FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ControlException"
    ADD CONSTRAINT "ControlException_rejectedByUserId_fkey"
    FOREIGN KEY ("rejectedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ControlException"
    ADD CONSTRAINT "ControlException_deletedByUserId_fkey"
    FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── CHECK constraints ──────────────────────────────────────────────

-- An APPROVED row must carry the full approver triple
-- (approvedAt + approvedByUserId + expiresAt). Other statuses must
-- NOT carry approver fields — those slots are reserved for the
-- approval transition.
ALTER TABLE "ControlException"
    ADD CONSTRAINT "ControlException_approval_shape"
    CHECK (
        ("status" = 'APPROVED' AND "approvedAt" IS NOT NULL AND "approvedByUserId" IS NOT NULL AND "expiresAt" IS NOT NULL)
        OR ("status" <> 'APPROVED' AND ("approvedAt" IS NULL) = ("approvedByUserId" IS NULL))
    );

-- A REJECTED row must carry rejectedAt + rejectedByUserId.
-- Non-rejected rows must NOT carry a rejection timestamp/actor or
-- reason text — auditors take a free-text reason on a non-rejected
-- row as a malformed write.
ALTER TABLE "ControlException"
    ADD CONSTRAINT "ControlException_rejection_shape"
    CHECK (
        ("status" = 'REJECTED' AND "rejectedAt" IS NOT NULL AND "rejectedByUserId" IS NOT NULL)
        OR ("status" <> 'REJECTED' AND "rejectedAt" IS NULL AND "rejectedByUserId" IS NULL AND "rejectionReason" IS NULL)
    );

-- An EXPIRED row must have once been APPROVED — so it carries the
-- expiry deadline + approver triple. The job that flips status
-- from APPROVED → EXPIRED never clears those fields.
ALTER TABLE "ControlException"
    ADD CONSTRAINT "ControlException_expired_shape"
    CHECK (
        "status" <> 'EXPIRED'
        OR ("approvedAt" IS NOT NULL AND "approvedByUserId" IS NOT NULL AND "expiresAt" IS NOT NULL)
    );

-- A renewal must reference a different row — `renewedFromId` cannot
-- equal this row's own id (tightens against an obviously malformed
-- self-renewal write that the application validator should reject
-- anyway).
ALTER TABLE "ControlException"
    ADD CONSTRAINT "ControlException_renewal_not_self"
    CHECK ("renewedFromId" IS NULL OR "renewedFromId" <> "id");

-- ── Row Level Security ─────────────────────────────────────────────

ALTER TABLE "ControlException" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ControlException" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ControlException";
CREATE POLICY tenant_isolation ON "ControlException"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "ControlException";
CREATE POLICY tenant_isolation_insert ON "ControlException"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "ControlException";
CREATE POLICY superuser_bypass ON "ControlException"
    USING (current_setting('role') != 'app_user');
