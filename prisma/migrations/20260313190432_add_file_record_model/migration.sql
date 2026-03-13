-- CreateEnum
CREATE TYPE "FileRecordStatus" AS ENUM ('PENDING', 'STORED', 'FAILED', 'DELETED');

-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "fileRecordId" TEXT;

-- CreateTable
CREATE TABLE "FileRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pathKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" "FileRecordStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "storedAt" TIMESTAMP(3),

    CONSTRAINT "FileRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FileRecord_pathKey_key" ON "FileRecord"("pathKey");

-- CreateIndex
CREATE INDEX "FileRecord_tenantId_idx" ON "FileRecord"("tenantId");

-- CreateIndex
CREATE INDEX "FileRecord_tenantId_status_idx" ON "FileRecord"("tenantId", "status");

-- CreateIndex
CREATE INDEX "FileRecord_tenantId_createdAt_idx" ON "FileRecord"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_fileRecordId_fkey" FOREIGN KEY ("fileRecordId") REFERENCES "FileRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileRecord" ADD CONSTRAINT "FileRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileRecord" ADD CONSTRAINT "FileRecord_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
