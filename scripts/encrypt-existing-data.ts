/**
 * Epic B.1 — One-shot plaintext → ciphertext backfill.
 *
 * Walks every (model, field) pair in `ENCRYPTED_FIELDS` and encrypts
 * rows that are still plaintext. Idempotent: rerunning the script is
 * a no-op once every row is encrypted.
 *
 * ## Execution model
 *   - Reads via `$queryRawUnsafe`.
 *   - Writes via `$executeRawUnsafe`.
 *
 * Both raw paths bypass every Prisma `$use` middleware — in
 * particular the Epic B.1 encryption middleware itself, which would
 * otherwise double-encrypt (we'd read ciphertext, the middleware
 * would decrypt to plaintext, we'd re-encrypt with a new IV). The
 * raw path sees the true on-disk value and lets `isEncryptedValue`
 * decide whether work is needed.
 *
 * ## Idempotency
 * The SELECT filters out values that already start with the `v1:`
 * prefix, so a resumed run after a partial crash picks up exactly
 * where the last batch ended. A belt-and-braces per-row
 * `isEncryptedValue()` check inside the loop catches anything that
 * slipped through the SELECT (e.g. a writer landed a ciphertext
 * mid-run).
 *
 * ## Order of deployment
 *   1. Ship the encryption middleware (so new writes encrypt).
 *   2. Run this backfill with `--dry-run` to preview counts.
 *   3. Run with `--execute` to actually encrypt existing rows.
 *   4. Ship the coverage guardrail test that asserts 100% of
 *      manifest rows are ciphertext. If it's green, Epic B.1's
 *      read-path decrypt is safely covering the whole table.
 *
 * Running this BEFORE step 1 is also safe — the middleware is a pure
 * add-on that tolerates mixed state — but new rows written between
 * steps 2 and 3 will arrive as plaintext and need a follow-up batch.
 *
 * ## Safety invariants
 *   - Script reads rows that are plaintext OR that look plaintext
 *     after trimming. Never double-encrypts.
 *   - `--dry-run` is the DEFAULT. Writes require an explicit
 *     `--execute` flag.
 *   - Per-row errors are isolated — a single corrupted row does not
 *     abort the whole migration.
 *   - Never logs field values. Logs record counts, model, field,
 *     row ids, and error messages.
 *
 * ## Usage
 *   npx tsx scripts/encrypt-existing-data.ts                     # dry-run
 *   npx tsx scripts/encrypt-existing-data.ts --execute            # write
 *   npx tsx scripts/encrypt-existing-data.ts --execute --verify   # write + roundtrip verify
 *   npx tsx scripts/encrypt-existing-data.ts --models Risk,Finding   # subset
 *   npx tsx scripts/encrypt-existing-data.ts --batch-size 100        # tune batch size
 */

// Require is used (not import) so the script runs under plain tsx
// without ESM/CommonJS friction.
/* eslint-disable @typescript-eslint/no-require-imports */
const {
    encryptField,
    decryptField,
    isEncryptedValue,
} = require('../src/lib/security/encryption') as typeof import('../src/lib/security/encryption');
const {
    ENCRYPTED_FIELDS,
} = require('../src/lib/security/encrypted-fields') as typeof import('../src/lib/security/encrypted-fields');
/* eslint-enable @typescript-eslint/no-require-imports */

import { PrismaClient } from '@prisma/client';

// ─── Types ──────────────────────────────────────────────────────────

export interface BackfillOptions {
    /** When false (default), no writes are performed; only counts are reported. */
    execute: boolean;
    /**
     * Roundtrip-verify each written ciphertext by decrypting it and
     * comparing to the original plaintext. Adds an AES-GCM decrypt
     * per row; negligible cost, catches key/algorithm misconfigs.
     */
    verify: boolean;
    /** Batch size per SELECT / per model. Defaults to 500. */
    batchSize: number;
    /** Optional subset of model names to migrate. Empty = all. */
    modelsFilter: readonly string[];
}

export interface FieldResult {
    model: string;
    field: string;
    scanned: number;                 // total rows read (plaintext candidates)
    encrypted: number;               // rows successfully encrypted + written
    skippedAlreadyEncrypted: number; // belt-and-braces hits inside the loop
    verifyFailures: number;          // --verify roundtrip mismatches
    errors: number;                  // per-row failures (logged + skipped)
}

export interface BackfillReport {
    options: BackfillOptions;
    results: FieldResult[];
    totalScanned: number;
    totalEncrypted: number;
    totalSkipped: number;
    totalVerifyFailures: number;
    totalErrors: number;
    durationMs: number;
}

// ─── Identifier validation ──────────────────────────────────────────
//
// Table + column names come from our own manifest, not user input, so
// strictly speaking interpolation is safe. We still validate defensively
// so a typo in the manifest produces a loud error instead of invalid
// SQL + a Postgres parse failure.

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertIdentifier(name: string, kind: string): void {
    if (!IDENT_RE.test(name)) {
        throw new Error(`Invalid ${kind} identifier: ${JSON.stringify(name)}`);
    }
}

// ─── Per-field backfill ─────────────────────────────────────────────

/**
 * Minimal Prisma surface the script uses. Declared here (rather than
 * via `Pick<PrismaClient, ...>`) so tests can inject a plain-promise
 * stub without wrestling with `PrismaPromise`'s branded type.
 */
export interface BackfillPrisma {
    $queryRawUnsafe<T = unknown>(sql: string, ...params: unknown[]): Promise<T>;
    $executeRawUnsafe(sql: string, ...params: unknown[]): Promise<number>;
}

export interface BackfillDeps {
    prisma: BackfillPrisma;
    /** Log sink — in tests we inject a spy. */
    log: (level: 'info' | 'warn' | 'error', msg: string, fields?: Record<string, unknown>) => void;
}

export async function encryptFieldForModel(
    deps: BackfillDeps,
    model: string,
    field: string,
    opts: BackfillOptions,
): Promise<FieldResult> {
    assertIdentifier(model, 'model');
    assertIdentifier(field, 'field');

    const result: FieldResult = {
        model,
        field,
        scanned: 0,
        encrypted: 0,
        skippedAlreadyEncrypted: 0,
        verifyFailures: 0,
        errors: 0,
    };

    const batchSize = Math.max(1, opts.batchSize);

    // SELECT excludes:
    //   - NULL values (nothing to encrypt)
    //   - empty strings (middleware passes them through as well)
    //   - values that start with the 'v1:' encryption version prefix
    //
    // Ordering by id keeps batches stable across a crash-resume.
    const selectSql = `
        SELECT id, "${field}" AS value
        FROM "${model}"
        WHERE "${field}" IS NOT NULL
          AND "${field}" <> ''
          AND "${field}" NOT LIKE 'v1:%'
        ORDER BY id
        LIMIT $1
    `;

    // Loop until we exhaust plaintext rows. Because the UPDATE
    // rewrites each returned row to ciphertext, the next SELECT
    // naturally returns the NEXT batch of plaintext rows (the ones
    // we just wrote are filtered out by `NOT LIKE 'v1:%'`).
    while (true) {
        let rows: Array<{ id: string; value: string }>;
        try {
            rows = await deps.prisma.$queryRawUnsafe<
                Array<{ id: string; value: string }>
            >(selectSql, batchSize);
        } catch (err) {
            deps.log('error', 'backfill.select_failed', {
                model,
                field,
                error: err instanceof Error ? err.message : String(err),
            });
            result.errors++;
            return result;
        }

        if (rows.length === 0) break;
        result.scanned += rows.length;

        for (const row of rows) {
            // Belt-and-braces — the SELECT already filtered `v1:%` out
            // but a stray value beating the filter (e.g. a ciphertext
            // that somehow doesn't start with the prefix on exactly
            // this row) would still be caught here.
            if (isEncryptedValue(row.value)) {
                result.skippedAlreadyEncrypted++;
                continue;
            }

            let ciphertext: string;
            try {
                ciphertext = encryptField(row.value);
            } catch (err) {
                result.errors++;
                deps.log('error', 'backfill.encrypt_failed', {
                    model,
                    field,
                    id: row.id,
                    error: err instanceof Error ? err.message : String(err),
                });
                continue;
            }

            if (opts.verify) {
                try {
                    const roundtrip = decryptField(ciphertext);
                    if (roundtrip !== row.value) {
                        result.verifyFailures++;
                        deps.log('error', 'backfill.verify_mismatch', {
                            model,
                            field,
                            id: row.id,
                        });
                        continue;
                    }
                } catch (err) {
                    result.verifyFailures++;
                    deps.log('error', 'backfill.verify_failed', {
                        model,
                        field,
                        id: row.id,
                        error: err instanceof Error ? err.message : String(err),
                    });
                    continue;
                }
            }

            if (!opts.execute) {
                // Dry-run — count the would-encrypt, don't write.
                result.encrypted++;
                continue;
            }

            try {
                await deps.prisma.$executeRawUnsafe(
                    `UPDATE "${model}" SET "${field}" = $1 WHERE id = $2`,
                    ciphertext,
                    row.id,
                );
                result.encrypted++;
            } catch (err) {
                result.errors++;
                deps.log('error', 'backfill.update_failed', {
                    model,
                    field,
                    id: row.id,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        // Progress breadcrumb — one line per batch so operators can
        // track forward motion on a big table without drowning the
        // log stream. Never includes values.
        deps.log('info', 'backfill.batch_complete', {
            model,
            field,
            batchSize: rows.length,
            scannedSoFar: result.scanned,
            encryptedSoFar: result.encrypted,
            skippedSoFar: result.skippedAlreadyEncrypted,
        });

        // Tail case — a short batch means we've caught up.
        if (rows.length < batchSize) break;
    }

    return result;
}

// ─── Orchestration ──────────────────────────────────────────────────

export async function runBackfill(
    deps: BackfillDeps,
    options: BackfillOptions,
): Promise<BackfillReport> {
    const started = Date.now();
    const filter = new Set(options.modelsFilter);
    const results: FieldResult[] = [];

    for (const [model, fields] of Object.entries(ENCRYPTED_FIELDS)) {
        if (filter.size > 0 && !filter.has(model)) continue;
        for (const field of fields) {
            const r = await encryptFieldForModel(deps, model, field, options);
            results.push(r);
        }
    }

    const totals = results.reduce(
        (acc, r) => ({
            totalScanned: acc.totalScanned + r.scanned,
            totalEncrypted: acc.totalEncrypted + r.encrypted,
            totalSkipped: acc.totalSkipped + r.skippedAlreadyEncrypted,
            totalVerifyFailures: acc.totalVerifyFailures + r.verifyFailures,
            totalErrors: acc.totalErrors + r.errors,
        }),
        {
            totalScanned: 0,
            totalEncrypted: 0,
            totalSkipped: 0,
            totalVerifyFailures: 0,
            totalErrors: 0,
        },
    );

    return {
        options,
        results,
        ...totals,
        durationMs: Date.now() - started,
    };
}

// ─── CLI entry point ────────────────────────────────────────────────

function parseArgs(argv: readonly string[]): BackfillOptions {
    const args = argv.slice(2);
    const execute = args.includes('--execute');
    const verify = args.includes('--verify');

    let batchSize = 500;
    const batchArg = args.find((a) => a.startsWith('--batch-size='));
    if (batchArg) {
        const n = parseInt(batchArg.split('=')[1], 10);
        if (!Number.isFinite(n) || n < 1) {
            throw new Error(`Invalid --batch-size: ${batchArg}`);
        }
        batchSize = n;
    }

    let modelsFilter: string[] = [];
    const modelsArg = args.find((a) => a.startsWith('--models='));
    if (modelsArg) {
        modelsFilter = modelsArg
            .split('=')[1]
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        // Validate immediately so typos fail before touching the DB.
        for (const m of modelsFilter) {
            if (!Object.prototype.hasOwnProperty.call(ENCRYPTED_FIELDS, m)) {
                throw new Error(`Unknown model in --models filter: ${m}`);
            }
        }
    }

    return { execute, verify, batchSize, modelsFilter };
}

function printReport(report: BackfillReport): void {
    const mode = report.options.execute ? 'EXECUTE' : 'DRY RUN';
    const line = (s: string): void => console.log(s);

    line('');
    line(`── Epic B.1 encryption backfill — ${mode} ──`);
    line('');

    if (!report.options.execute) {
        line('⚠  No writes performed. Rerun with --execute to persist.');
        line('');
    }

    for (const r of report.results) {
        const verb = report.options.execute ? 'encrypted' : 'would encrypt';
        line(
            `  ${r.model}.${r.field}: ${verb} ${r.encrypted}` +
                `, skipped ${r.skippedAlreadyEncrypted}` +
                `, errors ${r.errors}` +
                (report.options.verify
                    ? `, verify-failures ${r.verifyFailures}`
                    : ''),
        );
    }

    line('');
    line('── Totals ──');
    line(`  scanned:          ${report.totalScanned}`);
    line(
        `  ${report.options.execute ? 'encrypted' : 'would encrypt'}:        ${report.totalEncrypted}`,
    );
    line(`  already encrypted: ${report.totalSkipped}`);
    if (report.options.verify) {
        line(`  verify failures:  ${report.totalVerifyFailures}`);
    }
    line(`  errors:           ${report.totalErrors}`);
    line(`  duration:         ${report.durationMs}ms`);
    line('');

    if (report.totalErrors > 0 || report.totalVerifyFailures > 0) {
        line('❌ Completed with errors — investigate log lines prefixed `backfill.` above.');
    } else if (!report.options.execute) {
        line('✅ Dry run complete. Rerun with --execute to perform the migration.');
    } else {
        line('✅ Backfill complete.');
    }
}

// ─── Main ───────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
async function main(): Promise<void> {
    const options = parseArgs(process.argv);
    const prisma = new PrismaClient();
    try {
        const log: BackfillDeps['log'] = (level, msg, fields) => {
            const payload = { component: 'backfill-epic-b', ...fields };
            if (level === 'error') console.error(msg, payload);
            else if (level === 'warn') console.warn(msg, payload);
            else console.log(msg, payload);
        };
        const report = await runBackfill({ prisma, log }, options);
        printReport(report);
        if (report.totalErrors > 0 || report.totalVerifyFailures > 0) {
            process.exit(1);
        }
    } finally {
        await prisma.$disconnect();
    }
}

// Only run main() when invoked directly (not when imported from tests).
if (require.main === module) {
    main().catch((err) => {
        console.error('backfill.fatal', err);
        process.exit(2);
    });
}
/* eslint-enable @typescript-eslint/no-explicit-any */
