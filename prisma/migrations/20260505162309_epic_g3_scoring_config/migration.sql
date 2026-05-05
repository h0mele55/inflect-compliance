-- Epic G-3 prompt 5 — scoring configuration on VendorAssessmentTemplate.
--
-- Stores the per-template scoring mode + thresholds so the engine
-- can produce different aggregations for different questionnaires.
-- Null defaults to SIMPLE_SUM with no rating mapping (legacy
-- behaviour).

-- AlterTable
ALTER TABLE "VendorAssessmentTemplate" ADD COLUMN     "scoringConfigJson" JSONB;
