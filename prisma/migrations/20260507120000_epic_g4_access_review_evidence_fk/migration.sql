-- ═══════════════════════════════════════════════════════════════════
-- Epic G-4 closeout — link AccessReview to its evidence FileRecord.
--
-- Adds a nullable FK column so closeAccessReview can attach the
-- generated PDF artifact to the campaign row. SetNull on FileRecord
-- delete keeps the campaign intact if a stray evidence cleanup
-- removes the file (the audit log still has the closeout record).
--
-- Idempotent — re-runnable.
-- ═══════════════════════════════════════════════════════════════════

-- AlterTable
ALTER TABLE "AccessReview"
    ADD COLUMN IF NOT EXISTS "evidenceFileRecordId" TEXT;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'AccessReview_evidenceFileRecordId_fkey'
    ) THEN
        ALTER TABLE "AccessReview"
            ADD CONSTRAINT "AccessReview_evidenceFileRecordId_fkey"
            FOREIGN KEY ("evidenceFileRecordId") REFERENCES "FileRecord"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END
$$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccessReview_evidenceFileRecordId_idx"
    ON "AccessReview"("evidenceFileRecordId");
