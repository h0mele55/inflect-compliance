-- Epic 21 Phase 1: Tenant Custom Roles
-- Adds TenantCustomRole model and nullable customRoleId FK to TenantMembership.
-- Fully backward compatible: existing enum-based Role behavior is preserved.

-- 1. Create TenantCustomRole table
CREATE TABLE "TenantCustomRole" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseRole" "Role" NOT NULL DEFAULT 'READER',
    "permissionsJson" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantCustomRole_pkey" PRIMARY KEY ("id")
);

-- 2. Add nullable customRoleId to TenantMembership
ALTER TABLE "TenantMembership" ADD COLUMN "customRoleId" TEXT;

-- 3. Unique constraint: role names must be unique per tenant
CREATE UNIQUE INDEX "TenantCustomRole_tenantId_name_key" ON "TenantCustomRole"("tenantId", "name");

-- 4. Performance indexes
CREATE INDEX "TenantCustomRole_tenantId_idx" ON "TenantCustomRole"("tenantId");
CREATE INDEX "TenantCustomRole_tenantId_isActive_idx" ON "TenantCustomRole"("tenantId", "isActive");
CREATE INDEX "TenantMembership_customRoleId_idx" ON "TenantMembership"("customRoleId");

-- 5. Foreign key: TenantCustomRole → Tenant
ALTER TABLE "TenantCustomRole" ADD CONSTRAINT "TenantCustomRole_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Foreign key: TenantMembership.customRoleId → TenantCustomRole (SET NULL on delete)
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_customRoleId_fkey"
    FOREIGN KEY ("customRoleId") REFERENCES "TenantCustomRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
