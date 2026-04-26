-- Epic O-1 — hub-and-spoke organization layer.
--
-- Forward-only. Introduces:
--   * `Organization` parent table (1 → N tenants)
--   * `OrgMembership` per-user role assignment within an org
--   * `OrgRole` enum (ORG_ADMIN, ORG_READER)
--   * `Tenant.organizationId` nullable FK — backward compatible: every
--     existing tenant stays untethered until manually linked or
--     re-created via `/api/org/{slug}/tenants`.
--   * `TenantMembership.provisionedByOrgId` nullable tracking column —
--     auto-provisioned AUDITOR memberships carry this; manually-
--     created memberships keep it NULL. Distinguishing the two is
--     load-bearing for the deprovision usecase (Epic O-2): only
--     auto-created rows are deleted on ORG_ADMIN removal.
--
-- Both new FKs use ON DELETE SET NULL so deleting an org doesn't
-- delete its tenants or membership rows — they fall back to the
-- pre-org-layer semantics and keep working.

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('ORG_ADMIN', 'ORG_READER');

-- CreateTable
CREATE TABLE "Organization" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "slug"      TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateTable
CREATE TABLE "OrgMembership" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "role"           "OrgRole" NOT NULL DEFAULT 'ORG_READER',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrgMembership_organizationId_userId_key"
    ON "OrgMembership"("organizationId", "userId");
CREATE INDEX "OrgMembership_organizationId_idx"
    ON "OrgMembership"("organizationId");
CREATE INDEX "OrgMembership_userId_idx"
    ON "OrgMembership"("userId");

ALTER TABLE "OrgMembership"
    ADD CONSTRAINT "OrgMembership_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrgMembership"
    ADD CONSTRAINT "OrgMembership_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: link Tenant to Organization
ALTER TABLE "Tenant" ADD COLUMN "organizationId" TEXT;
CREATE INDEX "Tenant_organizationId_idx" ON "Tenant"("organizationId");
ALTER TABLE "Tenant"
    ADD CONSTRAINT "Tenant_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: track which org auto-provisioned a TenantMembership
ALTER TABLE "TenantMembership" ADD COLUMN "provisionedByOrgId" TEXT;
CREATE INDEX "TenantMembership_provisionedByOrgId_idx"
    ON "TenantMembership"("provisionedByOrgId");
ALTER TABLE "TenantMembership"
    ADD CONSTRAINT "TenantMembership_provisionedByOrgId_fkey"
    FOREIGN KEY ("provisionedByOrgId") REFERENCES "Organization"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
