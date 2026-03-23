-- CreateEnum
CREATE TYPE "MfaPolicy" AS ENUM ('DISABLED', 'OPTIONAL', 'REQUIRED');

-- CreateEnum
CREATE TYPE "MfaType" AS ENUM ('TOTP');

-- AlterTable
ALTER TABLE "FileRecord" ADD COLUMN     "bucket" TEXT,
ADD COLUMN     "domain" TEXT NOT NULL DEFAULT 'general',
ADD COLUMN     "scanStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "storageProvider" TEXT NOT NULL DEFAULT 'local';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TenantSecuritySettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mfaPolicy" "MfaPolicy" NOT NULL DEFAULT 'DISABLED',
    "sessionMaxAgeMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSecuritySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserMfaEnrollment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "MfaType" NOT NULL DEFAULT 'TOTP',
    "secretEncrypted" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "lastChallengeAt" TIMESTAMP(3),
    "backupCodesHashJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMfaEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantSecuritySettings_tenantId_key" ON "TenantSecuritySettings"("tenantId");

-- CreateIndex
CREATE INDEX "UserMfaEnrollment_userId_idx" ON "UserMfaEnrollment"("userId");

-- CreateIndex
CREATE INDEX "UserMfaEnrollment_tenantId_idx" ON "UserMfaEnrollment"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "UserMfaEnrollment_userId_tenantId_type_key" ON "UserMfaEnrollment"("userId", "tenantId", "type");

-- CreateIndex
CREATE INDEX "FileRecord_tenantId_scanStatus_idx" ON "FileRecord"("tenantId", "scanStatus");

-- AddForeignKey
ALTER TABLE "TenantSecuritySettings" ADD CONSTRAINT "TenantSecuritySettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMfaEnrollment" ADD CONSTRAINT "UserMfaEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMfaEnrollment" ADD CONSTRAINT "UserMfaEnrollment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
