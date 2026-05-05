-- Epic G-3 prompt 3 — outbound questionnaire send.
--
-- Two additive changes:
--   1. New EmailNotificationType value VENDOR_ASSESSMENT_INVITATION
--      so the canonical enqueueEmail() pipeline can carry the new
--      message type.
--   2. VendorAssessment.templateId drops NOT NULL and the FK
--      transitions to ON DELETE SET NULL. New G-3 sends populate
--      `templateVersionId` instead of the legacy `templateId`;
--      legacy approval-flow rows keep their non-null value.

-- AlterEnum
ALTER TYPE "EmailNotificationType" ADD VALUE 'VENDOR_ASSESSMENT_INVITATION';

-- DropForeignKey
ALTER TABLE "VendorAssessment" DROP CONSTRAINT "VendorAssessment_templateId_fkey";

-- AlterTable
ALTER TABLE "VendorAssessment" ALTER COLUMN "templateId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "VendorAssessment" ADD CONSTRAINT "VendorAssessment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "QuestionnaireTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
