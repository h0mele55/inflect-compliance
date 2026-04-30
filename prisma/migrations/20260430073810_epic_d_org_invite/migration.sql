-- ═══════════════════════════════════════════════════════════════════
-- Epic D — OrgInvite (invitation-gated org onboarding)
-- ═══════════════════════════════════════════════════════════════════
--
-- Mirror of TenantInvite at the org layer. See
-- prisma/schema/auth.prisma::OrgInvite for the lifecycle semantics
-- (atomic claim, email-mismatch burns, 7-day TTL, idempotent
-- upsert on (organizationId, email)).
--
-- This migration is IDEMPOTENT — safe to re-run.
--
-- NOTE: the `ALTER COLUMN … DROP NOT NULL` diffs that
-- prisma-migrate emitted for User / AuditorAccount / UserIdentityLink
-- were intentionally STRIPPED. Same GAP-21 schema-DB drift documented
-- in prior migrations: the schema models say `String?` but the DB
-- columns stay `NOT NULL`, enforced by the
-- pii-hash-not-null guardrail.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1) Enum: extend OrgAuditAction with invitation events ─────────

ALTER TYPE "OrgAuditAction" ADD VALUE IF NOT EXISTS 'ORG_INVITE_CREATED';
ALTER TYPE "OrgAuditAction" ADD VALUE IF NOT EXISTS 'ORG_INVITE_REDEEMED';
ALTER TYPE "OrgAuditAction" ADD VALUE IF NOT EXISTS 'ORG_INVITE_REVOKED';

-- ─── 2) OrgInvite table ────────────────────────────────────────────

CREATE TABLE "OrgInvite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'ORG_READER',
    "token" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgInvite_pkey" PRIMARY KEY ("id")
);

-- ─── 3) Indexes ────────────────────────────────────────────────────

CREATE UNIQUE INDEX "OrgInvite_token_key" ON "OrgInvite"("token");
CREATE INDEX "OrgInvite_token_idx" ON "OrgInvite"("token");
CREATE INDEX "OrgInvite_organizationId_idx" ON "OrgInvite"("organizationId");
CREATE UNIQUE INDEX "OrgInvite_organizationId_email_key"
    ON "OrgInvite"("organizationId", "email");

-- ─── 4) Foreign keys ───────────────────────────────────────────────

ALTER TABLE "OrgInvite" ADD CONSTRAINT "OrgInvite_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrgInvite" ADD CONSTRAINT "OrgInvite_invitedById_fkey"
    FOREIGN KEY ("invitedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

SELECT 'OrgInvite created — invitation lifecycle ready' AS result;
