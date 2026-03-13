-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "certificationsJson" JSONB,
ADD COLUMN     "enrichmentLastRunAt" TIMESTAMP(3),
ADD COLUMN     "enrichmentStatus" TEXT,
ADD COLUMN     "privacyPolicyUrl" TEXT,
ADD COLUMN     "securityPageUrl" TEXT;
