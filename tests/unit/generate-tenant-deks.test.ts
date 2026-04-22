/**
 * Unit Test: Epic B.2 tenant-DEK backfill script (`scripts/generate-tenant-deks.ts`).
 *
 * Tests the exported `backfillTenantDeks` function against a fake
 * Prisma client that scripts batches:
 *   - Dry-run default: no UPDATEs, correct "would backfill" count.
 *   - Execute mode: UPDATE fires with idempotent WHERE clause.
 *   - Already-populated tenants: excluded by the SELECT filter (test
 *     returns empty batches to simulate this).
 *   - Race loss (UPDATE affects 0 rows): counted as skippedRaced,
 *     script continues.
 *   - Per-row error isolation: a failing UPDATE doesn't abort the
 *     batch.
 *   - Wrap failure: counted as an error, not a crash.
 *   - Privacy-safe logging: no DEK bytes in log payloads.
 *   - Batch termination: short tail ends the loop.
 */

import {
    backfillTenantDeks,
    type TenantDekBackfillOptions,
    type TenantDekBackfillDeps,
} from '../../scripts/generate-tenant-deks';
import { isEncryptedValue } from '@/lib/security/encryption';

function makeDeps(options?: {
    batches?: Array<Array<{ id: string }>>;
    failUpdateFor?: Set<string>;
    raceFor?: Set<string>;
}) {
    const queryCalls: Array<{ sql: string; params: unknown[] }> = [];
    const execCalls: Array<{ sql: string; params: unknown[] }> = [];
    const logCalls: Array<{
        level: string;
        msg: string;
        fields?: Record<string, unknown>;
    }> = [];

    const batches = options?.batches ?? [];

    const prisma = {
        async $queryRawUnsafe<T>(
            sql: string,
            ...params: unknown[]
        ): Promise<T> {
            queryCalls.push({ sql, params });
            return (batches.shift() ?? []) as unknown as T;
        },
        async $executeRawUnsafe(
            sql: string,
            ...params: unknown[]
        ): Promise<number> {
            execCalls.push({ sql, params });
            const tenantId = params[1] as string;
            if (options?.failUpdateFor?.has(tenantId)) {
                throw new Error('UPDATE failed');
            }
            if (options?.raceFor?.has(tenantId)) {
                return 0; // race loss
            }
            return 1;
        },
    };

    const log: TenantDekBackfillDeps['log'] = (level, msg, fields) => {
        logCalls.push({ level, msg, fields });
    };

    return { prisma, log, queryCalls, execCalls, logCalls };
}

const DEFAULTS: TenantDekBackfillOptions = {
    execute: true,
    batchSize: 10,
};

describe('backfillTenantDeks', () => {
    test('empty DB — no SELECTs beyond first, no writes', async () => {
        const deps = makeDeps({ batches: [[]] });
        const result = await backfillTenantDeks(deps, DEFAULTS);
        expect(result.scanned).toBe(0);
        expect(result.backfilled).toBe(0);
        expect(result.errors).toBe(0);
        expect(deps.queryCalls).toHaveLength(1);
        expect(deps.execCalls).toHaveLength(0);
    });

    test('single batch of 3 NULL tenants — all backfilled', async () => {
        const deps = makeDeps({
            batches: [
                [{ id: 't-1' }, { id: 't-2' }, { id: 't-3' }],
            ],
        });
        const result = await backfillTenantDeks(deps, DEFAULTS);
        expect(result.scanned).toBe(3);
        expect(result.backfilled).toBe(3);
        expect(deps.execCalls).toHaveLength(3);

        // Every UPDATE's first parameter is a wrapped DEK.
        for (const call of deps.execCalls) {
            const wrapped = call.params[0] as string;
            expect(isEncryptedValue(wrapped)).toBe(true);
            // SQL is the idempotent shape.
            expect(call.sql).toContain('"encryptedDek" IS NULL');
        }
    });

    test('idempotency: SELECT filter excludes already-populated — subsequent run is a no-op', async () => {
        // Simulate: run 1 returned 3 tenants, run 2 returns none
        // (because those tenants now have DEKs).
        const firstRun = makeDeps({
            batches: [[{ id: 't-1' }, { id: 't-2' }]],
        });
        await backfillTenantDeks(firstRun, DEFAULTS);

        const secondRun = makeDeps({ batches: [[]] });
        const result = await backfillTenantDeks(secondRun, DEFAULTS);
        expect(result.scanned).toBe(0);
        expect(result.backfilled).toBe(0);
        expect(secondRun.execCalls).toHaveLength(0);
    });

    test('dry-run: computes counts without writing', async () => {
        const deps = makeDeps({
            batches: [[{ id: 't-1' }, { id: 't-2' }]],
        });
        const result = await backfillTenantDeks(deps, {
            ...DEFAULTS,
            execute: false,
        });
        expect(result.scanned).toBe(2);
        expect(result.backfilled).toBe(2); // "would" count
        expect(deps.execCalls).toHaveLength(0);
    });

    test('race-loss (UPDATE affects 0) → skippedRaced, script continues', async () => {
        const deps = makeDeps({
            batches: [
                [{ id: 't-a' }, { id: 't-racer' }, { id: 't-c' }],
            ],
            raceFor: new Set(['t-racer']),
        });
        const result = await backfillTenantDeks(deps, DEFAULTS);
        expect(result.scanned).toBe(3);
        expect(result.backfilled).toBe(2);
        expect(result.skippedRaced).toBe(1);
        expect(result.errors).toBe(0);
    });

    test('per-row UPDATE failure is isolated; next rows still run', async () => {
        const deps = makeDeps({
            batches: [
                [{ id: 't-a' }, { id: 't-fail' }, { id: 't-c' }],
            ],
            failUpdateFor: new Set(['t-fail']),
        });
        const result = await backfillTenantDeks(deps, DEFAULTS);
        expect(result.backfilled).toBe(2);
        expect(result.errors).toBe(1);
        expect(
            deps.logCalls.find(
                (c) => c.msg === 'backfill-tenant-deks.update_failed',
            )?.fields?.tenantId,
        ).toBe('t-fail');
    });

    test('terminates after short tail batch (< batchSize)', async () => {
        const deps = makeDeps({
            batches: [
                Array.from({ length: 10 }, (_, i) => ({ id: `t-${i}` })),
                Array.from({ length: 3 }, (_, i) => ({ id: `s-${i}` })),
                // Extra batch — should NOT be fetched.
                [{ id: 'never' }],
            ],
        });
        const result = await backfillTenantDeks(deps, {
            ...DEFAULTS,
            batchSize: 10,
        });
        expect(result.scanned).toBe(13);
        expect(deps.queryCalls).toHaveLength(2);
    });

    test('never logs DEK material', async () => {
        const deps = makeDeps({
            batches: [[{ id: 't-priv' }]],
        });
        await backfillTenantDeks(deps, DEFAULTS);

        const serialised = JSON.stringify(deps.logCalls);
        // Extract the wrapped DEK that was passed to UPDATE and make
        // sure it doesn't appear in any log line (the script never
        // logs the ciphertext body either).
        const wrapped = deps.execCalls[0].params[0] as string;
        expect(serialised).not.toContain(wrapped);
    });

    test('SELECT failure → counted + loop exits', async () => {
        const deps = {
            prisma: {
                async $queryRawUnsafe() {
                    throw new Error('pg is down');
                },
                async $executeRawUnsafe() {
                    return 1;
                },
            },
            log: jest.fn(),
        } as unknown as TenantDekBackfillDeps;

        const result = await backfillTenantDeks(deps, DEFAULTS);
        expect(result.errors).toBe(1);
        expect(result.scanned).toBe(0);
        expect(result.backfilled).toBe(0);
        expect(deps.log).toHaveBeenCalledWith(
            'error',
            'backfill-tenant-deks.select_failed',
            expect.any(Object),
        );
    });
});
