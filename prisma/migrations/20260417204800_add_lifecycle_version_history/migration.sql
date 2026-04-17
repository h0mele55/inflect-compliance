-- AlterTable: Add lifecycle version counter and history JSON to Policy
-- Matches CISO-Assistant editing_version + editing_history pattern
ALTER TABLE "Policy" ADD COLUMN "lifecycleVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Policy" ADD COLUMN "lifecycleHistoryJson" JSONB;

-- AlterTable: Add lifecycle version counter and history JSON to VendorAssessment
ALTER TABLE "VendorAssessment" ADD COLUMN "lifecycleVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "VendorAssessment" ADD COLUMN "lifecycleHistoryJson" JSONB;
