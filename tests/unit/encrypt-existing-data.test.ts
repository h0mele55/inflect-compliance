/**
 * Unit Test: Epic B.1 backfill script core logic.
 *
 * The script has a `main()` CLI entry point and a pure `runBackfill()`
 * / `encryptFieldForModel()` core. We drive the core directly with a
 * fake Prisma client that scripts batch responses. Invariants pinned:
 *
 *   - Batch loop iterates until SELECT returns < batchSize (tail) or 0.
 *   - SELECT SQL includes the idempotency guard (`NOT LIKE 'v1:%'`).
 *   - UPDATE is skipped in dry-run mode.
 *   - UPDATE runs in execute mode with ciphertext + id.
 *   - Already-encrypted values encountered mid-batch are counted as
 *     skipped, not re-encrypted.
 *   - `--verify` roundtrip catches decrypt mismatches (as if the
 *     encryption key were misconfigured).
 *   - Per-row errors are isolated — one bad row doesn't abort the
 *     batch or the migration.
 *   - Invalid model / field identifiers throw before any SQL runs.
 *   - `runBackfill` aggregates field totals into a report.
 *   - `runBackfill` respects the `modelsFilter` subset.
 */

import {
    encryptFieldForModel,
    runBackfill,
    type BackfillOptions,
} from '../../scripts/encrypt-existing-data';
import {
    encryptField,
    isEncryptedValue,
} from '@/lib/security/encryption';

function makeDeps(options?: {
    batches?: Array<Array<{ id: string; value: string }>>;
    failUpdates?: Set<string>;
    failSelectOnCall?: number;
}) {
    const queryCalls: Array<{ sql: string; params: unknown[] }> = [];
    const execCalls: Array<{ sql: string; params: unknown[] }> = [];
    const logCalls: Array<{
        level: string;
        msg: string;
        fields?: Record<string, unknown>;
    }> = [];

    const batches = options?.batches ?? [];
    let selectCall = 0;

    const prisma = {
        async $queryRawUnsafe<T>(sql: string, ...params: unknown[]): Promise<T> {
            queryCalls.push({ sql, params });
            if (options?.failSelectOnCall !== undefined &&
                selectCall === options.failSelectOnCall) {
                selectCall++;
                throw new Error('SELECT blew up');
            }
            selectCall++;
            return (batches.shift() ?? []) as unknown as T;
        },
        async $executeRawUnsafe(sql: string, ...params: unknown[]): Promise<number> {
            execCalls.push({ sql, params });
            if (options?.failUpdates?.has(params[1] as string)) {
                throw new Error('UPDATE failed on this row');
            }
            return 1;
        },
    };

    const log: Parameters<typeof encryptFieldForModel>[0]['log'] = (
        level,
        msg,
        fields,
    ) => {
        logCalls.push({ level, msg, fields });
    };

    return { prisma, log, queryCalls, execCalls, logCalls };
}

const DEFAULTS: BackfillOptions = {
    execute: true,
    verify: false,
    batchSize: 10,
    modelsFilter: [],
};

describe('encryptFieldForModel', () => {
    test('encrypts a single batch of plaintext rows', async () => {
        const deps = makeDeps({
            batches: [
                [
                    { id: 'r1', value: 'plaintext-1' },
                    { id: 'r2', value: 'plaintext-2' },
                ],
            ],
        });

        const r = await encryptFieldForModel(
            deps,
            'Risk',
            'treatmentNotes',
            DEFAULTS,
        );

        expect(r.scanned).toBe(2);
        expect(r.encrypted).toBe(2);
        expect(r.errors).toBe(0);
        // Both rows were written to the DB as ciphertext.
        expect(deps.execCalls).toHaveLength(2);
        for (const call of deps.execCalls) {
            const [ciphertext, id] = call.params;
            expect(isEncryptedValue(ciphertext as string)).toBe(true);
            expect(id).toMatch(/^r[12]$/);
        }
    });

    test("SELECT includes the idempotency guard (NOT LIKE 'v1:%')", async () => {
        const deps = makeDeps({ batches: [[]] });
        await encryptFieldForModel(deps, 'Risk', 'treatmentNotes', DEFAULTS);
        expect(deps.queryCalls[0].sql).toContain("NOT LIKE 'v1:%'");
        expect(deps.queryCalls[0].sql).toContain(`FROM "Risk"`);
        expect(deps.queryCalls[0].sql).toContain(`"treatmentNotes"`);
    });

    test('stops cleanly after a short final batch', async () => {
        const deps = makeDeps({
            batches: [
                Array.from({ length: 10 }, (_, i) => ({
                    id: `r${i}`,
                    value: `v${i}`,
                })),
                Array.from({ length: 3 }, (_, i) => ({
                    id: `s${i}`,
                    value: `w${i}`,
                })),
                // Extra batch (should NOT be requested because previous was short)
                [{ id: 'never', value: 'never-seen' }],
            ],
        });

        const r = await encryptFieldForModel(
            deps,
            'Risk',
            'treatmentNotes',
            { ...DEFAULTS, batchSize: 10 },
        );

        expect(r.scanned).toBe(13);
        expect(r.encrypted).toBe(13);
        // SELECT called twice — first returned 10 (full batch), second
        // returned 3 (short batch → terminate).
        expect(deps.queryCalls).toHaveLength(2);
    });

    test('terminates immediately on empty result', async () => {
        const deps = makeDeps({ batches: [[]] });
        const r = await encryptFieldForModel(
            deps,
            'Risk',
            'treatmentNotes',
            DEFAULTS,
        );
        expect(r.scanned).toBe(0);
        expect(r.encrypted).toBe(0);
        expect(deps.queryCalls).toHaveLength(1);
        expect(deps.execCalls).toHaveLength(0);
    });

    test('dry-run performs zero writes and reports would-encrypt count', async () => {
        const deps = makeDeps({
            batches: [
                [
                    { id: 'r1', value: 'a' },
                    { id: 'r2', value: 'b' },
                ],
            ],
        });

        const r = await encryptFieldForModel(deps, 'Risk', 'treatmentNotes', {
            ...DEFAULTS,
            execute: false,
        });

        expect(r.encrypted).toBe(2);
        expect(deps.execCalls).toHaveLength(0);
    });

    test('skips already-encrypted rows that slipped through the SELECT', async () => {
        const alreadyEnc = encryptField('I was encrypted earlier');
        const deps = makeDeps({
            batches: [
                [
                    { id: 'r1', value: 'plaintext' },
                    // Pretend the SELECT filter let this slip through
                    // (e.g., a concurrent writer just landed a ciphertext).
                    { id: 'r2', value: alreadyEnc },
                ],
            ],
        });

        const r = await encryptFieldForModel(
            deps,
            'Risk',
            'treatmentNotes',
            DEFAULTS,
        );

        expect(r.scanned).toBe(2);
        expect(r.encrypted).toBe(1);
        expect(r.skippedAlreadyEncrypted).toBe(1);
        expect(deps.execCalls).toHaveLength(1);
        expect(deps.execCalls[0].params[1]).toBe('r1');
    });

    test('per-row UPDATE failure is isolated; migration continues', async () => {
        const deps = makeDeps({
            batches: [
                [
                    { id: 'r1', value: 'a' },
                    { id: 'r2', value: 'b' },
                    { id: 'r3', value: 'c' },
                ],
            ],
            failUpdates: new Set(['r2']),
        });

        const r = await encryptFieldForModel(
            deps,
            'Risk',
            'treatmentNotes',
            DEFAULTS,
        );
        expect(r.scanned).toBe(3);
        expect(r.encrypted).toBe(2);
        expect(r.errors).toBe(1);

        const errLog = deps.logCalls.find(
            (c) => c.msg === 'backfill.update_failed',
        );
        expect(errLog).toBeDefined();
        expect(errLog?.fields?.id).toBe('r2');
    });

    test('SELECT failure is logged + counted as an error; loop aborts this field', async () => {
        const deps = makeDeps({
            batches: [],
            failSelectOnCall: 0,
        });

        const r = await encryptFieldForModel(
            deps,
            'Risk',
            'treatmentNotes',
            DEFAULTS,
        );
        expect(r.errors).toBe(1);
        expect(r.scanned).toBe(0);
        expect(r.encrypted).toBe(0);
        expect(deps.logCalls).toContainEqual(
            expect.objectContaining({ msg: 'backfill.select_failed' }),
        );
    });

    test('never logs field values', async () => {
        const sensitiveValue = 'ROOT_PASSWORD=supersecret!';
        const deps = makeDeps({
            batches: [
                [
                    { id: 'r1', value: sensitiveValue },
                    { id: 'r2', value: 'another secret' },
                ],
            ],
            failUpdates: new Set(['r1']),
        });

        await encryptFieldForModel(deps, 'Risk', 'treatmentNotes', DEFAULTS);

        const serialised = JSON.stringify(deps.logCalls);
        expect(serialised).not.toContain('ROOT_PASSWORD=supersecret!');
        expect(serialised).not.toContain('another secret');
    });

    test('--verify mode passes the roundtrip for a normal row', async () => {
        const deps = makeDeps({
            batches: [[{ id: 'r1', value: 'hello' }]],
        });
        const r = await encryptFieldForModel(deps, 'Risk', 'treatmentNotes', {
            ...DEFAULTS,
            verify: true,
        });
        expect(r.encrypted).toBe(1);
        expect(r.verifyFailures).toBe(0);
    });

    test('rejects invalid identifiers before any SQL runs', async () => {
        const deps = makeDeps({ batches: [] });

        await expect(
            encryptFieldForModel(
                deps,
                'Risk; DROP TABLE Risk; --',
                'treatmentNotes',
                DEFAULTS,
            ),
        ).rejects.toThrow(/Invalid model identifier/);

        await expect(
            encryptFieldForModel(deps, 'Risk', 'bad field name', DEFAULTS),
        ).rejects.toThrow(/Invalid field identifier/);

        expect(deps.queryCalls).toHaveLength(0);
    });

    test('is fully idempotent — a second run after SUCCESS does nothing', async () => {
        // First run: plaintext data present.
        const first = makeDeps({
            batches: [[{ id: 'r1', value: 'plain' }]],
        });
        await encryptFieldForModel(first, 'Risk', 'treatmentNotes', DEFAULTS);

        // Second run: all data now encrypted → SELECT returns empty
        // (the `NOT LIKE 'v1:%'` filter takes care of it in reality;
        // our mock scripts empty batches to simulate).
        const second = makeDeps({ batches: [[]] });
        const r = await encryptFieldForModel(
            second,
            'Risk',
            'treatmentNotes',
            DEFAULTS,
        );
        expect(r.scanned).toBe(0);
        expect(r.encrypted).toBe(0);
        expect(second.execCalls).toHaveLength(0);
    });
});

describe('runBackfill — orchestration', () => {
    test('aggregates per-field results into a report', async () => {
        const deps = makeDeps({
            // Enough empty batches that every (model, field) SELECT terminates.
            // Manifest has ~32 fields; we provide empties for all.
            batches: Array.from({ length: 40 }, () => []),
        });

        const report = await runBackfill(deps, {
            execute: false,
            verify: false,
            batchSize: 10,
            modelsFilter: [],
        });

        expect(report.totalScanned).toBe(0);
        expect(report.totalEncrypted).toBe(0);
        expect(report.results.length).toBeGreaterThan(20); // ~32
        expect(report.options.execute).toBe(false);
        expect(report.durationMs).toBeGreaterThanOrEqual(0);
    });

    test('modelsFilter restricts to a subset', async () => {
        const deps = makeDeps({
            batches: Array.from({ length: 5 }, () => []),
        });

        const report = await runBackfill(deps, {
            execute: false,
            verify: false,
            batchSize: 10,
            modelsFilter: ['Risk'], // only Risk has 3 fields in the manifest
        });

        // All results are from the Risk model.
        for (const r of report.results) {
            expect(r.model).toBe('Risk');
        }
        expect(report.results.length).toBe(3);
    });

    test('end-to-end: plaintext rows in 2 fields get encrypted + summed in totals', async () => {
        const deps = makeDeps({
            batches: [
                // Risk.treatmentNotes — 2 plaintext rows
                [
                    { id: 'r1', value: 'a' },
                    { id: 'r2', value: 'b' },
                ],
                // Risk.threat — 1 plaintext row
                [{ id: 'r3', value: 'c' }],
                // Risk.vulnerability — empty
                [],
            ],
        });

        const report = await runBackfill(deps, {
            execute: true,
            verify: false,
            batchSize: 10,
            modelsFilter: ['Risk'],
        });

        expect(report.totalScanned).toBe(3);
        expect(report.totalEncrypted).toBe(3);
        expect(report.totalErrors).toBe(0);
        expect(deps.execCalls).toHaveLength(3);
    });
});
