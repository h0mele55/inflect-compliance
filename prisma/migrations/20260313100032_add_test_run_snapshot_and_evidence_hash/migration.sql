-- AlterEnum
ALTER TYPE "AuditPackItemEntityType" ADD VALUE 'TEST_RUN';

-- AlterTable
ALTER TABLE "ControlTestEvidenceLink" ADD COLUMN     "sha256Hash" TEXT;
