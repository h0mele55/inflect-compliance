-- CreateEnum
CREATE TYPE "IdentityProviderType" AS ENUM ('SAML', 'OIDC');

-- CreateTable
CREATE TABLE "TenantIdentityProvider" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "IdentityProviderType" NOT NULL,
    "name" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isEnforced" BOOLEAN NOT NULL DEFAULT false,
    "emailDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "configJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantIdentityProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserIdentityLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "externalSubject" TEXT NOT NULL,
    "emailAtLinkTime" TEXT NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserIdentityLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantIdentityProvider_tenantId_name_key" ON "TenantIdentityProvider"("tenantId", "name");

-- CreateIndex
CREATE INDEX "TenantIdentityProvider_tenantId_idx" ON "TenantIdentityProvider"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentityLink_providerId_externalSubject_key" ON "UserIdentityLink"("providerId", "externalSubject");

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentityLink_userId_providerId_key" ON "UserIdentityLink"("userId", "providerId");

-- CreateIndex
CREATE INDEX "UserIdentityLink_tenantId_idx" ON "UserIdentityLink"("tenantId");

-- CreateIndex
CREATE INDEX "UserIdentityLink_userId_idx" ON "UserIdentityLink"("userId");

-- AddForeignKey
ALTER TABLE "TenantIdentityProvider" ADD CONSTRAINT "TenantIdentityProvider_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIdentityLink" ADD CONSTRAINT "UserIdentityLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIdentityLink" ADD CONSTRAINT "UserIdentityLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIdentityLink" ADD CONSTRAINT "UserIdentityLink_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "TenantIdentityProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
