-- Epic 21: Enterprise Identity — API Keys
-- Adds TenantApiKey model for machine-to-machine authentication.

-- 1. Create TenantApiKey table
CREATE TABLE "TenantApiKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedIp" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantApiKey_pkey" PRIMARY KEY ("id")
);

-- 2. Unique index on keyHash (for lookup during auth)
CREATE UNIQUE INDEX "TenantApiKey_keyHash_key" ON "TenantApiKey"("keyHash");

-- 3. Performance indexes
CREATE INDEX "TenantApiKey_tenantId_idx" ON "TenantApiKey"("tenantId");
CREATE INDEX "TenantApiKey_tenantId_revokedAt_idx" ON "TenantApiKey"("tenantId", "revokedAt");

-- 4. Foreign key: TenantApiKey → Tenant
ALTER TABLE "TenantApiKey" ADD CONSTRAINT "TenantApiKey_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Foreign key: TenantApiKey.createdById → User
ALTER TABLE "TenantApiKey" ADD CONSTRAINT "TenantApiKey_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
