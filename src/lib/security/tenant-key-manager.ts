/**
 * Epic B.2 — Tenant key manager (runtime layer).
 *
 * Sits above the primitives in `tenant-keys.ts` (which only know how
 * to generate / wrap / unwrap DEKs, in-memory) and provides the
 * tenant-lifecycle surface the rest of the app talks to:
 *
 *   - `createTenantWithDek(data)` — atomic "create a tenant with
 *     its wrapped DEK already populated". The one call every
 *     tenant-creation path should use.
 *
 *   - `ensureTenantDek(tenantId)` — idempotent backfill for a single
 *     tenant. Writes a DEK iff the column is currently NULL. Used
 *     by `scripts/generate-tenant-deks.ts` and (as a defensive
 *     fallback) by `getTenantDek` on first access.
 *
 *   - `getTenantDek(tenantId)` — the runtime hot path. Resolves a
 *     tenant's raw DEK (Buffer), hitting an in-memory cache in the
 *     common case. Unwraps on cold miss; lazily generates +
 *     persists + primes cache if the column is NULL.
 *
 *   - `clearTenantDekCache(tenantId?)` / `getTenantDekCacheSize()`
 *     — observability + invalidation hooks for rotation.
 *
 *   - `rotateTenantDek(tenantId)` — per-tenant DEK rotation stub
 *     (stub — throws; see body). Reserves the API surface and the
 *     `Tenant.previousEncryptedDek` schema column for the real
 *     implementation. Today callers receive a runbook-carrying error
 *     pointing at the current master-KEK workaround.
 *
 * ## Cache semantics
 *
 * The cache is an in-process `Map` of `tenantId → Buffer`, bounded
 * at `MAX_CACHE_SIZE`. It uses insertion-order LRU eviction (the
 * first key added gets evicted when the cap is hit). Lifetime is
 * process-lifetime with no TTL — the DEK bytes are the same for a
 * given tenant until a rotation, and holding the raw key in memory
 * avoids a DB read + unwrap on every request.
 *
 * This is a deliberate trade-off:
 *   + No per-request unwrap cost (otherwise every field access pays
 *     an AES-GCM decrypt of the wrapped DEK).
 *   + Recovery is automatic — cache miss re-reads + re-unwraps.
 *   – Raw key material lives in process memory until eviction or
 *     restart. A hostile read of process memory (coredump,
 *     debugger) could lift it out. The same threat applies to the
 *     derived KEK cached in `encryption.ts`; we accept the same
 *     posture here. Hardening (e.g. `sodium_memzero`, KMS-backed
 *     unwrap) is a future prompt's concern.
 *
 * ## Concurrency
 *
 * `ensureTenantDek` and `getTenantDek`'s lazy-init branch both
 * issue `UPDATE tenant SET encryptedDek = … WHERE id = … AND
 * encryptedDek IS NULL`. Two concurrent requests for the same
 * fresh tenant will BOTH try to write; one wins, one is a no-op
 * (affected rows = 0). Neither produces a corrupted state — the
 * losing request refetches and uses the winner's DEK.
 *
 * A process-level race where two processes unwrap the same wrapped
 * DEK and cache independent copies is fine: both Buffers carry the
 * same bytes by construction (AES-GCM decrypts deterministically
 * given the same key + ciphertext).
 */

import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
    generateAndWrapDek,
    generateDek,
    unwrapDek,
    wrapDek,
    type TenantDek,
    type WrappedDek,
} from './tenant-keys';
import { logger } from '@/lib/observability/logger';

// ─── Cache ──────────────────────────────────────────────────────────

const MAX_CACHE_SIZE = 1000;
const dekCache = new Map<string, TenantDek>();

/**
 * Insert or refresh the cache entry, evicting the oldest key when
 * the cap is exceeded. Map's iteration order is insertion-order, so
 * `keys().next().value` is the least-recently-inserted entry —
 * equivalent to a simple LRU when combined with delete-before-set
 * on cache-hit refresh.
 */
function setCached(tenantId: string, dek: TenantDek): void {
    if (dekCache.size >= MAX_CACHE_SIZE && !dekCache.has(tenantId)) {
        const oldest = dekCache.keys().next().value;
        if (oldest !== undefined) dekCache.delete(oldest);
    }
    dekCache.set(tenantId, dek);
}

function getCached(tenantId: string): TenantDek | undefined {
    const cached = dekCache.get(tenantId);
    if (!cached) return undefined;
    // LRU refresh — delete + re-insert moves the key to the end of
    // insertion order so it's the last to be evicted.
    dekCache.delete(tenantId);
    dekCache.set(tenantId, cached);
    return cached;
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Create a tenant with its wrapped DEK populated atomically. The
 * DEK is generated, wrapped under the global KEK, and saved in a
 * single `tenant.create` call; the raw DEK is primed into the
 * cache so the first request against the new tenant doesn't pay
 * an unwrap round-trip.
 *
 * Use this EVERYWHERE a new tenant is created:
 *   - register route
 *   - SSO auto-onboarding (when it lands)
 *   - seed scripts
 *   - test fixtures that need a DEK from the start
 *
 * Direct `prisma.tenant.create` still works (nullable column) but
 * leaves the tenant dependent on backfill to get a DEK.
 */
export async function createTenantWithDek(
    data: Omit<Prisma.TenantCreateInput, 'encryptedDek'>,
): Promise<Prisma.TenantGetPayload<Record<string, never>>> {
    const { dek, wrapped } = generateAndWrapDek();
    const tenant = await prisma.tenant.create({
        data: { ...data, encryptedDek: wrapped },
    });
    setCached(tenant.id, dek);
    logger.info('tenant-key-manager.tenant_created_with_dek', {
        component: 'tenant-key-manager',
        tenantId: tenant.id,
    });
    return tenant;
}

/**
 * Guarantee that this tenant has a wrapped DEK. Idempotent:
 *   - If encryptedDek is already set → no-op, return.
 *   - If NULL → generate + wrap + save + prime cache.
 *
 * Use this from backfill scripts and from safety-net paths that
 * want to ensure a tenant is ready for encryption before hitting
 * a hot read path. `getTenantDek` internally calls this on demand,
 * so usecase code rarely needs to call it directly.
 */
export async function ensureTenantDek(tenantId: string): Promise<void> {
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { encryptedDek: true },
    });
    if (!tenant) {
        throw new Error(
            `ensureTenantDek: tenant ${tenantId} not found`,
        );
    }
    if (tenant.encryptedDek !== null) return;

    const dek = generateDek();
    const wrapped = wrapDek(dek);

    // Race-safe write: if another process beat us to it, the
    // `encryptedDek IS NULL` predicate makes our UPDATE a no-op and
    // no row is mutated. Either way the tenant ends up with a DEK;
    // callers that need to use it can re-fetch.
    const result = await prisma.tenant.updateMany({
        where: { id: tenantId, encryptedDek: null },
        data: { encryptedDek: wrapped },
    });

    if (result.count === 1) {
        setCached(tenantId, dek);
        logger.info('tenant-key-manager.dek_backfilled', {
            component: 'tenant-key-manager',
            tenantId,
        });
    } else {
        // Someone else won the race — clear our local DEK and let
        // the next getTenantDek unwrap the winner's value.
        logger.debug('tenant-key-manager.dek_backfill_raced', {
            component: 'tenant-key-manager',
            tenantId,
        });
    }
}

/**
 * Resolve a tenant's raw DEK for use as an AES-256-GCM key. Hot
 * path — most calls hit the in-memory cache.
 *
 * Behaviour:
 *   1. Cache hit → return (touches LRU).
 *   2. Cache miss + encryptedDek present → unwrap, cache, return.
 *   3. Cache miss + encryptedDek NULL → lazy init via
 *      `ensureTenantDek`, re-read, return.
 *
 * Throws if the tenant doesn't exist.
 */
export async function getTenantDek(tenantId: string): Promise<TenantDek> {
    const cached = getCached(tenantId);
    if (cached) return cached;

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { encryptedDek: true },
    });
    if (!tenant) {
        throw new Error(`getTenantDek: tenant ${tenantId} not found`);
    }

    if (tenant.encryptedDek === null) {
        // Lazy init + read-after-write to handle the race where
        // another process concurrently populated encryptedDek. After
        // ensureTenantDek returns, one of us wrote; re-read to get
        // the canonical value.
        await ensureTenantDek(tenantId);
        const reloaded = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { encryptedDek: true },
        });
        if (!reloaded || !reloaded.encryptedDek) {
            throw new Error(
                `getTenantDek: tenant ${tenantId} has no encryptedDek after ensure`,
            );
        }
        const dek = unwrapDek(reloaded.encryptedDek);
        setCached(tenantId, dek);
        return dek;
    }

    const dek = unwrapDek(tenant.encryptedDek);
    setCached(tenantId, dek);
    return dek;
}

/**
 * Invalidate the cache for a tenant (rotation) or globally (restart
 * / test cleanup).
 */
export function clearTenantDekCache(tenantId?: string): void {
    if (tenantId) {
        dekCache.delete(tenantId);
    } else {
        dekCache.clear();
    }
}

/** Observability — current cache size. Useful for metrics. */
export function getTenantDekCacheSize(): number {
    return dekCache.size;
}

/**
 * Rotate a tenant's Data Encryption Key.
 *
 * When implemented: generates a fresh 32-byte DEK, writes it to
 * `Tenant.encryptedDek`, moves the prior wrapped value into
 * `Tenant.previousEncryptedDek`, and enqueues a background job that
 * re-encrypts every ciphertext carrying the v2:<tenant-dek>:...
 * envelope under the new DEK. On completion, clears
 * previousEncryptedDek.
 *
 * === NOT YET IMPLEMENTED ===
 *
 * Workaround for a suspected tenant-DEK compromise today
 * (master-KEK rotation path, Epic B):
 *
 *   1. Generate a new 32-byte key. Set env DATA_ENCRYPTION_KEY=<new>
 *      and DATA_ENCRYPTION_KEY_PREVIOUS=<old>, redeploy.
 *   2. For each tenant (or just the compromised one):
 *      `POST /api/t/<slug>/admin/key-rotation` — enqueues the
 *      master-KEK rotation job which re-encrypts every v1 ciphertext
 *      under the new primary KEK and re-wraps the per-tenant DEK.
 *   3. When the job reports zero v1 rows for every tenant, remove
 *      DATA_ENCRYPTION_KEY_PREVIOUS from env and redeploy.
 *
 * See docs/epic-b-encryption.md for the full runbook.
 */
export async function rotateTenantDek(tenantId: string): Promise<never> {
    // Reference the arg so TypeScript sees it as intentional.
    void tenantId;
    throw new Error(
        'rotateTenantDek: per-tenant DEK rotation is not implemented. ' +
        'Workaround: set DATA_ENCRYPTION_KEY_PREVIOUS=<old>, ' +
        'DATA_ENCRYPTION_KEY=<new>, redeploy, then POST ' +
        '/api/t/<slug>/admin/key-rotation to re-encrypt under the new KEK. ' +
        'See docs/epic-b-encryption.md.',
    );
}

// ─── Test-only helpers ──────────────────────────────────────────────

/** @internal — visible to tests only. Peek without touching LRU order. */
export function _peekCachedDek(tenantId: string): TenantDek | undefined {
    return dekCache.get(tenantId);
}

/** @internal — reset the cache AND reclaim capacity. */
export function _resetTenantDekCache(): void {
    dekCache.clear();
}

/** @internal — expose the size cap so tests can craft eviction scenarios. */
export const _MAX_CACHE_SIZE = MAX_CACHE_SIZE;
