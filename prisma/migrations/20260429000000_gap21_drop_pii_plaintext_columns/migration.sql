-- ─────────────────────────────────────────────────────────────────
-- GAP-21 — Drop legacy plaintext PII columns; enforce hash-based
-- uniqueness; require encrypted/hash NOT NULL on auth-identity
-- models.
--
-- Scope: User, AuditorAccount, UserIdentityLink. Other models with
-- the same dual-column pattern (VendorContact, NotificationOutbox,
-- Account) ride a follow-up migration when their call sites are
-- ported off plaintext lookups.
--
-- Pre-flight: every row MUST have a populated encrypted + hash
-- column for every managed field. The backfill script
-- `scripts/encrypt-existing-data.ts` populates these. If any row
-- still has plaintext-without-encrypted, this migration RAISES and
-- aborts before any destructive change. Operators run the backfill
-- first, then deploy.
--
-- Rollback: see the rollback notes at the bottom of this file. The
-- destructive ALTERs at the end of the migration are intentionally
-- last so a pre-flight failure leaves the schema unchanged.
-- ─────────────────────────────────────────────────────────────────

-- ─── Pre-flight: refuse to drop plaintext if anything is unbackfilled ──

DO $$
DECLARE
    unbackfilled_count INTEGER;
BEGIN
    -- User: every row must have emailEncrypted + emailHash. The
    -- nameEncrypted column is allowed to be NULL only when the
    -- legacy `name` column is also NULL (an honestly-empty name).
    SELECT COUNT(*) INTO unbackfilled_count
    FROM "User"
    WHERE "emailEncrypted" IS NULL OR "emailHash" IS NULL;
    IF unbackfilled_count > 0 THEN
        RAISE EXCEPTION
            'GAP-21 migration aborted: % User rows are not backfilled. '
            'Run scripts/encrypt-existing-data.ts --execute --pii-only '
            'before deploying.', unbackfilled_count;
    END IF;

    SELECT COUNT(*) INTO unbackfilled_count
    FROM "User"
    WHERE "name" IS NOT NULL AND "name" <> '' AND "nameEncrypted" IS NULL;
    IF unbackfilled_count > 0 THEN
        RAISE EXCEPTION
            'GAP-21 migration aborted: % User rows have a non-empty name '
            'without nameEncrypted. Run the backfill script first.',
            unbackfilled_count;
    END IF;

    -- AuditorAccount: email is required at the schema level.
    SELECT COUNT(*) INTO unbackfilled_count
    FROM "AuditorAccount"
    WHERE "emailEncrypted" IS NULL OR "emailHash" IS NULL;
    IF unbackfilled_count > 0 THEN
        RAISE EXCEPTION
            'GAP-21 migration aborted: % AuditorAccount rows are not '
            'backfilled. Run scripts/encrypt-existing-data.ts --execute '
            '--pii-only first.', unbackfilled_count;
    END IF;

    SELECT COUNT(*) INTO unbackfilled_count
    FROM "AuditorAccount"
    WHERE "name" IS NOT NULL AND "name" <> '' AND "nameEncrypted" IS NULL;
    IF unbackfilled_count > 0 THEN
        RAISE EXCEPTION
            'GAP-21 migration aborted: % AuditorAccount rows have a non-empty '
            'name without nameEncrypted. Run the backfill script first.',
            unbackfilled_count;
    END IF;

    -- UserIdentityLink: emailAtLinkTime is required.
    SELECT COUNT(*) INTO unbackfilled_count
    FROM "UserIdentityLink"
    WHERE "emailAtLinkTimeEncrypted" IS NULL OR "emailAtLinkTimeHash" IS NULL;
    IF unbackfilled_count > 0 THEN
        RAISE EXCEPTION
            'GAP-21 migration aborted: % UserIdentityLink rows are not '
            'backfilled. Run scripts/encrypt-existing-data.ts --execute '
            '--pii-only first.', unbackfilled_count;
    END IF;
END $$;

-- ─── Pre-flight: hash uniqueness within scope ─────────────────────

DO $$
DECLARE
    dupe_count INTEGER;
BEGIN
    -- A hash collision (or stale duplicate plaintexts that survived
    -- a pre-encrypted era) would block the @unique constraint on
    -- emailHash. Refuse to apply rather than ALTER-then-fail.
    SELECT COUNT(*) INTO dupe_count FROM (
        SELECT "emailHash", COUNT(*) c
        FROM "User"
        WHERE "emailHash" IS NOT NULL
        GROUP BY "emailHash" HAVING COUNT(*) > 1
    ) d;
    IF dupe_count > 0 THEN
        RAISE EXCEPTION
            'GAP-21 migration aborted: % duplicate User.emailHash values '
            'detected. Resolve duplicates before re-running.', dupe_count;
    END IF;

    SELECT COUNT(*) INTO dupe_count FROM (
        SELECT "tenantId", "emailHash", COUNT(*) c
        FROM "AuditorAccount"
        WHERE "emailHash" IS NOT NULL
        GROUP BY "tenantId", "emailHash" HAVING COUNT(*) > 1
    ) d;
    IF dupe_count > 0 THEN
        RAISE EXCEPTION
            'GAP-21 migration aborted: % duplicate (tenantId, emailHash) '
            'pairs in AuditorAccount. Resolve duplicates before '
            're-running.', dupe_count;
    END IF;
END $$;

-- ─── User ──────────────────────────────────────────────────────────

-- Drop the unique index on the plaintext email column. The new
-- uniqueness anchor is User.emailHash (already @unique in schema).
DROP INDEX IF EXISTS "User_email_key";

-- Drop the legacy plaintext columns now that backfill has been
-- verified above.
ALTER TABLE "User" DROP COLUMN "email";
ALTER TABLE "User" DROP COLUMN "name";

-- Tighten encrypted + hash columns to NOT NULL — they are the new
-- canonical storage for these fields.
ALTER TABLE "User" ALTER COLUMN "emailEncrypted" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "emailHash" SET NOT NULL;

-- ─── AuditorAccount ────────────────────────────────────────────────

-- Replace the legacy composite unique on plaintext (tenantId, email)
-- with the hash-anchored composite (tenantId, emailHash).
ALTER TABLE "AuditorAccount" DROP CONSTRAINT IF EXISTS "AuditorAccount_tenantId_email_key";
DROP INDEX IF EXISTS "AuditorAccount_tenantId_email_key";

-- The previous schema only had an ordinary index on emailHash; the
-- new schema turns it into a unique composite, which subsumes the
-- read-side index.
DROP INDEX IF EXISTS "AuditorAccount_emailHash_idx";

ALTER TABLE "AuditorAccount" DROP COLUMN "email";
ALTER TABLE "AuditorAccount" DROP COLUMN "name";

ALTER TABLE "AuditorAccount" ALTER COLUMN "emailEncrypted" SET NOT NULL;
ALTER TABLE "AuditorAccount" ALTER COLUMN "emailHash" SET NOT NULL;

ALTER TABLE "AuditorAccount" ADD CONSTRAINT "AuditorAccount_tenantId_emailHash_key" UNIQUE ("tenantId", "emailHash");

-- ─── UserIdentityLink ──────────────────────────────────────────────

ALTER TABLE "UserIdentityLink" DROP COLUMN "emailAtLinkTime";

ALTER TABLE "UserIdentityLink" ALTER COLUMN "emailAtLinkTimeEncrypted" SET NOT NULL;
ALTER TABLE "UserIdentityLink" ALTER COLUMN "emailAtLinkTimeHash" SET NOT NULL;

-- ─── Rollback notes ────────────────────────────────────────────────
--
-- This migration is intentionally NON-REVERSIBLE in production: the
-- plaintext columns are dropped after their data has been moved to
-- the encrypted columns. Rolling back would mean re-decrypting every
-- row to restore plaintext columns, which defeats the security
-- objective.
--
-- If this migration fails AT THE DO BLOCK (pre-flight), nothing is
-- changed and re-running after operator action is safe.
--
-- If this migration fails AFTER an ALTER TABLE has executed, the
-- recovery is forward-only:
--   1. Restart Postgres on the same WAL segment to roll back the
--      uncommitted transaction. (All ALTER TABLEs in this file run
--      under one implicit transaction.)
--   2. Investigate the failure (the most likely cause is a hash
--      collision that wasn't caught by the pre-flight; check the
--      RAISE NOTICE output).
--   3. Resolve the underlying issue (e.g. delete duplicate user)
--      and re-run.
