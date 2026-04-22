/**
 * Unit Test: Epic B.2 tenant key manager runtime layer.
 *
 * Pins:
 *   - `createTenantWithDek` atomically populates encryptedDek +
 *     caches the raw DEK.
 *   - `ensureTenantDek` is idempotent:
 *       - NULL tenant → writes + caches
 *       - Already-populated tenant → no-op
 *       - Race (UPDATE affects 0 rows) → logs + does not poison cache
 *   - `getTenantDek` resolution order:
 *       - Cache hit → no DB touch
 *       - Cache miss + populated → unwrap + cache
 *       - Cache miss + NULL → lazy init + cache
 *   - Cache LRU: size cap, insertion-order eviction, refresh-on-hit.
 *   - `clearTenantDekCache` targeted + global reset.
 *   - No DEK bytes appear in logs.
 *   - Throws on unknown tenant.
 */

jest.mock('@/lib/observability/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

// Prisma mock — all methods we touch are implemented as jest.fn().
const mockTenant = {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
};
jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: { tenant: mockTenant },
    prisma: { tenant: mockTenant },
}));

import {
    createTenantWithDek,
    ensureTenantDek,
    getTenantDek,
    clearTenantDekCache,
    getTenantDekCacheSize,
    _peekCachedDek,
    _resetTenantDekCache,
    _MAX_CACHE_SIZE,
} from '@/lib/security/tenant-key-manager';
import {
    unwrapDek,
    wrapDek,
    generateDek,
    isWrappedDek,
    DEK_LENGTH_BYTES,
} from '@/lib/security/tenant-keys';
import { logger } from '@/lib/observability/logger';

describe('tenant-key-manager', () => {
    beforeEach(() => {
        _resetTenantDekCache();
        jest.clearAllMocks();
    });

    describe('createTenantWithDek', () => {
        test('creates tenant with a wrapped DEK and primes the cache', async () => {
            mockTenant.create.mockImplementation(async (args) => ({
                id: 't-new',
                ...args.data,
            }));

            const tenant = await createTenantWithDek({
                name: 'Acme',
                slug: 'acme',
            });

            expect(mockTenant.create).toHaveBeenCalledTimes(1);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const created = mockTenant.create.mock.calls[0][0] as any;
            expect(created.data.name).toBe('Acme');
            expect(created.data.slug).toBe('acme');
            expect(isWrappedDek(created.data.encryptedDek)).toBe(true);

            // Cache is primed — the raw DEK matches unwrapDek(stored).
            const cached = _peekCachedDek('t-new');
            expect(cached).toBeDefined();
            expect(cached!.length).toBe(DEK_LENGTH_BYTES);
            expect(
                cached!.equals(unwrapDek(created.data.encryptedDek)),
            ).toBe(true);

            expect(tenant.id).toBe('t-new');
        });

        test('never logs DEK bytes', async () => {
            mockTenant.create.mockImplementation(async (args) => ({
                id: 't-log',
                ...args.data,
            }));
            await createTenantWithDek({ name: 'X', slug: 'x' });
            const cached = _peekCachedDek('t-log')!;
            const serialised = JSON.stringify(
                (logger.info as jest.Mock).mock.calls,
            );
            expect(serialised).not.toContain(cached.toString('hex'));
            expect(serialised).not.toContain(cached.toString('base64'));
        });
    });

    describe('ensureTenantDek', () => {
        test('NULL tenant → generates, wraps, writes, caches', async () => {
            mockTenant.findUnique.mockResolvedValue({ encryptedDek: null });
            mockTenant.updateMany.mockResolvedValue({ count: 1 });

            await ensureTenantDek('t-null');

            expect(mockTenant.updateMany).toHaveBeenCalledTimes(1);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const args = mockTenant.updateMany.mock.calls[0][0] as any;
            expect(isWrappedDek(args.data.encryptedDek)).toBe(true);
            expect(args.where).toEqual({
                id: 't-null',
                encryptedDek: null,
            });

            const cached = _peekCachedDek('t-null');
            expect(cached).toBeDefined();
            expect(cached!.length).toBe(DEK_LENGTH_BYTES);
        });

        test('already-populated tenant → no-op, no UPDATE', async () => {
            const existing = wrapDek(generateDek());
            mockTenant.findUnique.mockResolvedValue({
                encryptedDek: existing,
            });

            await ensureTenantDek('t-set');

            expect(mockTenant.updateMany).not.toHaveBeenCalled();
            expect(_peekCachedDek('t-set')).toBeUndefined();
        });

        test('race loss (updateMany affects 0 rows) → no cache write, still no throw', async () => {
            mockTenant.findUnique.mockResolvedValue({ encryptedDek: null });
            mockTenant.updateMany.mockResolvedValue({ count: 0 });

            await ensureTenantDek('t-race');

            expect(_peekCachedDek('t-race')).toBeUndefined();
            expect(logger.debug).toHaveBeenCalledWith(
                'tenant-key-manager.dek_backfill_raced',
                expect.objectContaining({ tenantId: 't-race' }),
            );
        });

        test('unknown tenant → throws', async () => {
            mockTenant.findUnique.mockResolvedValue(null);
            await expect(ensureTenantDek('ghost')).rejects.toThrow(
                /tenant ghost not found/,
            );
        });
    });

    describe('getTenantDek', () => {
        test('cache hit short-circuits the DB', async () => {
            const dek = generateDek();
            // Prime cache by faking a create.
            mockTenant.create.mockImplementation(async (args) => ({
                id: 't-cached',
                ...args.data,
            }));
            // Manually inject a known DEK into the cache path.
            mockTenant.findUnique.mockResolvedValue({
                encryptedDek: wrapDek(dek),
            });
            const first = await getTenantDek('t-cached');
            mockTenant.findUnique.mockClear();

            const second = await getTenantDek('t-cached');
            expect(second.equals(first)).toBe(true);
            expect(mockTenant.findUnique).not.toHaveBeenCalled();
        });

        test('cache miss + populated → unwrap path, then cache', async () => {
            const dek = generateDek();
            mockTenant.findUnique.mockResolvedValue({
                encryptedDek: wrapDek(dek),
            });

            const resolved = await getTenantDek('t-wrap');
            expect(resolved.equals(dek)).toBe(true);
            expect(_peekCachedDek('t-wrap')?.equals(dek)).toBe(true);
        });

        test('cache miss + NULL → lazy init populates + caches', async () => {
            // First findUnique (in getTenantDek): NULL.
            // Then ensureTenantDek: findUnique (still NULL), updateMany.
            // Then re-read findUnique: populated with our write.
            let readCount = 0;
            let storedDek: string | null = null;
            mockTenant.findUnique.mockImplementation(async () => {
                readCount++;
                return { encryptedDek: storedDek };
            });
            mockTenant.updateMany.mockImplementation(async (args) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                storedDek = (args.data as any).encryptedDek;
                return { count: 1 };
            });

            const dek = await getTenantDek('t-lazy');

            expect(dek.length).toBe(DEK_LENGTH_BYTES);
            expect(storedDek).not.toBeNull();
            expect(isWrappedDek(storedDek!)).toBe(true);
            // The cached buffer equals the unwrap of the stored row.
            expect(_peekCachedDek('t-lazy')?.equals(dek)).toBe(true);
            // findUnique called at least twice (getTenantDek initial
            // read + post-ensure read).
            expect(readCount).toBeGreaterThanOrEqual(2);
        });

        test('unknown tenant → throws', async () => {
            mockTenant.findUnique.mockResolvedValue(null);
            await expect(getTenantDek('ghost')).rejects.toThrow(
                /tenant ghost not found/,
            );
        });
    });

    describe('cache semantics', () => {
        test('clearTenantDekCache targeted removes one entry only', async () => {
            const aDek = generateDek();
            const bDek = generateDek();
            mockTenant.findUnique
                .mockResolvedValueOnce({ encryptedDek: wrapDek(aDek) })
                .mockResolvedValueOnce({ encryptedDek: wrapDek(bDek) });
            await getTenantDek('a');
            await getTenantDek('b');
            expect(getTenantDekCacheSize()).toBe(2);

            clearTenantDekCache('a');
            expect(_peekCachedDek('a')).toBeUndefined();
            expect(_peekCachedDek('b')?.equals(bDek)).toBe(true);
        });

        test('clearTenantDekCache (no arg) empties everything', async () => {
            mockTenant.findUnique
                .mockResolvedValueOnce({ encryptedDek: wrapDek(generateDek()) })
                .mockResolvedValueOnce({ encryptedDek: wrapDek(generateDek()) });
            await getTenantDek('a');
            await getTenantDek('b');
            expect(getTenantDekCacheSize()).toBe(2);

            clearTenantDekCache();
            expect(getTenantDekCacheSize()).toBe(0);
        });

        test('LRU eviction at size cap keeps most recently touched entries', async () => {
            // Sanity: the cap is large; we'll verify the eviction shape
            // without having to insert _MAX_CACHE_SIZE rows.
            expect(_MAX_CACHE_SIZE).toBeGreaterThan(0);

            // Fill to the cap + 1, using unique tenant ids. Each insert
            // goes via the unwrap path for realism.
            const cap = _MAX_CACHE_SIZE;
            mockTenant.findUnique.mockImplementation(async () => ({
                encryptedDek: wrapDek(generateDek()),
            }));

            for (let i = 0; i < cap; i++) {
                await getTenantDek(`t-${i}`);
            }
            expect(getTenantDekCacheSize()).toBe(cap);

            // Touch t-0 to promote it to newest.
            await getTenantDek('t-0');

            // Insert a new tenant — should evict the oldest remaining
            // (t-1), NOT t-0.
            await getTenantDek(`t-${cap}`);
            expect(_peekCachedDek('t-0')).toBeDefined();
            expect(_peekCachedDek('t-1')).toBeUndefined();
            expect(getTenantDekCacheSize()).toBe(cap);
        });
    });
});
