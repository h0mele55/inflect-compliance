/**
 * Epic B.1 + B.2 — Transparent field-level encryption middleware.
 *
 * Installs a Prisma `$use` hook that encrypts manifest fields on
 * write and decrypts them on read. The key used for each operation
 * is resolved at hook entry:
 *
 *   ─ **B.2 path (default):** when `getAuditContext()` carries a
 *     `tenantId` from an authenticated request, the middleware calls
 *     `getTenantKeyManager().getTenantDek(tenantId)` to get the raw
 *     per-tenant DEK and uses `encryptWithKey` / `decryptWithKey`.
 *     Ciphertexts carry the `v2:` envelope prefix.
 *
 *   ─ **B.1 fallback:** when there's no tenant context (seed / job /
 *     system bypass paths, webhook ingest pre-identification, auth
 *     discovery), the middleware falls back to `encryptField` /
 *     `decryptField` under the global KEK. Ciphertexts carry the
 *     `v1:` envelope prefix. Read mixed-state remains safe because
 *     the decrypt path dispatches per-value on the `v1:` / `v2:`
 *     prefix.
 *
 * ## Mixed-state rollout
 *
 * Rows written before B.2 rollout are `v1:`. Rows written after are
 * `v2:`. The read path handles both — `getCiphertextVersion()` picks
 * the right decrypt. A big-bang re-encrypt is unnecessary; rows
 * slowly migrate as they're updated, and the backfill script can
 * force it explicitly later.
 *
 * ## Cross-tenant isolation
 *
 * Each tenant's DEK is independent random bytes wrapped under the
 * global KEK. Decrypting tenant A's `v2:` ciphertext with tenant B's
 * DEK produces an AES-GCM auth-tag failure — the middleware logs the
 * warn, returns the raw ciphertext, and continues. The caller sees
 * undecrypted material (not a decrypt-crash); ops sees the incident
 * via the `decrypt_failed` log line.
 *
 * ## Recursion guard
 *
 * Resolving a tenant's DEK issues `prisma.tenant.findUnique`, which
 * re-enters this middleware. `Tenant` is not in the encrypted-fields
 * manifest, so the inner hook's fan-out finds nothing to process —
 * but we also skip DEK resolution entirely when `params.model ===
 * 'Tenant'` to avoid any risk of infinite recursion.
 *
 * ## Idempotency
 *
 * Every ciphertext carries a `v1:` or `v2:` prefix. Writes skip
 * values that already match either prefix (`isEncryptedValue()`),
 * so nested-write fan-out, test doubles, and concurrent writes
 * never produce double ciphertext.
 *
 * ## Null / empty
 *
 * `null` / `undefined` / `''` pass through unchanged — encrypting
 * an empty string wastes bytes with no security gain.
 */

import type { PrismaClient } from '@prisma/client';
import {
    encryptField,
    decryptField,
    encryptWithKey,
    decryptWithKey,
    isEncryptedValue,
    getCiphertextVersion,
} from '@/lib/security/encryption';
import {
    getEncryptedFields,
    isEncryptedModel,
    ALL_ENCRYPTED_FIELD_NAMES,
    nodeHasAnyEncryptedFieldKey,
} from '@/lib/security/encrypted-fields';
import { getAuditContext } from '@/lib/audit-context';
import { logger } from '@/lib/observability/logger';

// ─── Action buckets ───────────────────────────────────────────────────

const WRITE_ACTIONS: ReadonlySet<string> = new Set([
    'create',
    'createMany',
    'createManyAndReturn',
    'update',
    'updateMany',
    'upsert',
]);

const RESULT_DECRYPT_ACTIONS: ReadonlySet<string> = new Set([
    'findFirst',
    'findUnique',
    'findFirstOrThrow',
    'findUniqueOrThrow',
    'findMany',
    'create',
    'update',
    'upsert',
    'createMany',
    'createManyAndReturn',
]);

/**
 * Audit-context `source` values that should fall back to the global
 * KEK (v1) instead of the tenant DEK (v2). These code paths don't
 * speak on behalf of a tenant — they're cross-tenant by design
 * (seeds populate globals, sweep jobs iterate all tenants, system
 * events are infrastructure), and making them write v2 under one
 * tenant's DEK would break their multi-tenant semantics.
 */
const BYPASS_SOURCES: ReadonlySet<string> = new Set([
    'seed',
    'job',
    'system',
]);

// ─── DEK resolution (Epic B.2) ────────────────────────────────────────

/**
 * Resolve the per-tenant DEK for the current operation, or `null`
 * when the middleware should fall back to the global KEK.
 *
 * Returns `null` when any of:
 *   - `model === 'Tenant'` — recursion guard. `getTenantDek` reads
 *     the `Tenant` row itself, which re-enters this hook; we must
 *     NOT try to resolve a DEK for a Tenant query.
 *   - no audit context (raw `prisma` calls outside the tenant wrapper)
 *   - `source` is one of the known bypass markers
 *   - the manager throws (missing tenant / DB error)
 *
 * In every `null` case, the middleware uses `encryptField` /
 * `decryptField` under the global KEK — same behaviour as Epic B.1.
 */
async function resolveTenantDek(
    model: string | undefined,
): Promise<Buffer | null> {
    if (model === 'Tenant') return null;

    const ctx = getAuditContext();
    const tenantId = ctx?.tenantId;
    if (!tenantId) return null;
    if (ctx?.source && BYPASS_SOURCES.has(ctx.source)) return null;

    // Lazy-require the key manager to dodge the circular-import risk
    // pattern we use elsewhere (see `db/rls-middleware.ts`).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getTenantDek } = require('@/lib/security/tenant-key-manager') as
        typeof import('@/lib/security/tenant-key-manager');

    try {
        return await getTenantDek(tenantId);
    } catch (err) {
        logger.warn('encryption-middleware.dek_resolve_failed', {
            component: 'encryption-middleware',
            tenantId,
            reason: err instanceof Error ? err.message : 'unknown',
        });
        return null;
    }
}

// ─── Encrypt traversal (write path) ──────────────────────────────────

/**
 * Encrypt a single value with either the tenant DEK (v2) or the
 * global KEK (v1). `null` dek → v1 fallback. All other safety
 * checks (null/empty/already-encrypted) are the caller's
 * responsibility.
 */
function encryptValue(plaintext: string, dek: Buffer | null): string {
    if (dek) return encryptWithKey(dek, plaintext);
    return encryptField(plaintext);
}

/**
 * Encrypt manifest fields on a single data node. Mutates in place.
 * Uses `dek` when present (B.2), else falls back to the global KEK.
 */
function encryptDataNode(
    data: Record<string, unknown>,
    modelName: string,
    dek: Buffer | null,
): void {
    const fields = getEncryptedFields(modelName);
    if (!fields) return;
    for (const field of fields) {
        const value = data[field];
        if (value === null || value === undefined) continue;
        if (typeof value !== 'string') continue;
        if (value.length === 0) continue;
        if (isEncryptedValue(value)) continue;
        data[field] = encryptValue(value, dek);
    }
}

/**
 * Fan-out encrypt: applied when a nested node's target model is
 * structurally unknown. Walks the node's OWN keys once and encrypts
 * any key that matches an encrypted field name anywhere in the
 * manifest.
 */
function encryptDataNodeAllModels(
    data: Record<string, unknown>,
    dek: Buffer | null,
): void {
    if (!nodeHasAnyEncryptedFieldKey(data)) return;
    for (const key of Object.keys(data)) {
        if (!ALL_ENCRYPTED_FIELD_NAMES.has(key)) continue;
        const value = data[key];
        if (value === null || value === undefined) continue;
        if (typeof value !== 'string') continue;
        if (value.length === 0) continue;
        if (isEncryptedValue(value)) continue;
        data[key] = encryptValue(value, dek);
    }
}

/**
 * Walk a Prisma write payload and encrypt every manifest field.
 * `modelName === '*'` triggers fan-out across all manifest models.
 */
function walkWriteArgument(
    payload: unknown,
    modelName: string,
    dek: Buffer | null,
): void {
    if (payload === null || payload === undefined) return;
    if (Array.isArray(payload)) {
        for (const item of payload) walkWriteArgument(item, modelName, dek);
        return;
    }
    if (typeof payload !== 'object') return;

    const node = payload as Record<string, unknown>;

    // 1. Encrypt fields on this node (direct or fan-out).
    if (modelName === '*') {
        encryptDataNodeAllModels(node, dek);
    } else {
        encryptDataNode(node, modelName, dek);
    }

    // 2. Descend into nested-writes shapes. Target model is unknown
    //    from structure alone — fan out via '*' but keep the DEK.
    for (const value of Object.values(node)) {
        if (!value || typeof value !== 'object') continue;
        const nested = value as Record<string, unknown>;
        if ('create' in nested) walkWriteArgument(nested.create, '*', dek);
        if ('update' in nested) walkWriteArgument(nested.update, '*', dek);
        if ('upsert' in nested) {
            const u = nested.upsert as Record<string, unknown> | undefined;
            if (u?.create) walkWriteArgument(u.create, '*', dek);
            if (u?.update) walkWriteArgument(u.update, '*', dek);
        }
        if ('connectOrCreate' in nested) {
            const coc = nested.connectOrCreate as
                | Record<string, unknown>
                | undefined;
            if (coc?.create) walkWriteArgument(coc.create, '*', dek);
        }
        if ('createMany' in nested) {
            const cm = nested.createMany as Record<string, unknown> | undefined;
            if (cm?.data) walkWriteArgument(cm.data, '*', dek);
        }
    }
}

// ─── Decrypt traversal (read path) ───────────────────────────────────

/**
 * Decrypt a single value based on its envelope version. v1 → global
 * KEK via `decryptField`. v2 → tenant DEK via `decryptWithKey`. If
 * the ciphertext is v2 but no DEK is available (cross-tenant bypass
 * read), the caller is expected to leave the value untouched and
 * log a warning — this function throws in that case so the caller
 * can distinguish "expected pass-through" from "real decrypt
 * failure".
 */
function decryptValue(ciphertext: string, dek: Buffer | null): string {
    const version = getCiphertextVersion(ciphertext);
    if (version === 'v1') {
        return decryptField(ciphertext);
    }
    if (version === 'v2') {
        if (!dek) {
            throw new Error(
                'encryption-middleware: v2 ciphertext encountered but no tenant DEK is resolvable',
            );
        }
        return decryptWithKey(dek, ciphertext);
    }
    // Shouldn't happen — caller gates on isEncryptedValue.
    throw new Error('encryption-middleware: unknown ciphertext envelope');
}

function decryptResultNode(
    node: Record<string, unknown>,
    modelName: string,
    dek: Buffer | null,
): void {
    const fields = getEncryptedFields(modelName);
    if (!fields) return;
    for (const field of fields) {
        const value = node[field];
        if (value === null || value === undefined) continue;
        if (typeof value !== 'string') continue;
        if (value.length === 0) continue;
        if (!isEncryptedValue(value)) continue;
        try {
            node[field] = decryptValue(value, dek);
        } catch (err) {
            // Never throw on read. A malformed row or a cross-tenant
            // bypass read that can't resolve the right DEK surfaces
            // as a warn + ciphertext pass-through, not a 500.
            logger.warn('encryption-middleware.decrypt_failed', {
                component: 'encryption-middleware',
                model: modelName,
                field,
                version: getCiphertextVersion(value),
                reason: err instanceof Error ? err.message : 'unknown',
            });
        }
    }
}

function decryptResultNodeAllModels(
    node: Record<string, unknown>,
    dek: Buffer | null,
): void {
    for (const key of Object.keys(node)) {
        if (!ALL_ENCRYPTED_FIELD_NAMES.has(key)) continue;
        const value = node[key];
        if (value === null || value === undefined) continue;
        if (typeof value !== 'string') continue;
        if (value.length === 0) continue;
        if (!isEncryptedValue(value)) continue;
        try {
            node[key] = decryptValue(value, dek);
        } catch (err) {
            logger.warn('encryption-middleware.decrypt_failed', {
                component: 'encryption-middleware',
                model: '*',
                field: key,
                version: getCiphertextVersion(value),
                reason: err instanceof Error ? err.message : 'unknown',
            });
        }
    }
}

/**
 * Walk a Prisma result tree and decrypt every manifest field we
 * find. Handles single objects, arrays, and included relations.
 */
function walkReadResult(
    result: unknown,
    modelName: string,
    dek: Buffer | null,
): void {
    if (result === null || result === undefined) return;
    if (Array.isArray(result)) {
        for (const item of result) walkReadResult(item, modelName, dek);
        return;
    }
    if (typeof result !== 'object') return;

    const node = result as Record<string, unknown>;

    if (modelName === '*') {
        // Fast path: if the node has zero keys matching ANY manifest
        // field name, we can skip the per-key iteration AND the per-
        // field type/prefix checks.
        if (nodeHasAnyEncryptedFieldKey(node)) {
            decryptResultNodeAllModels(node, dek);
        }
    } else {
        decryptResultNode(node, modelName, dek);
    }

    // Walk nested object / array values — might be included relations.
    for (const [key, value] of Object.entries(node)) {
        if (value === null || value === undefined) continue;
        if (typeof value !== 'object') continue;
        if (
            modelName !== '*' &&
            getEncryptedFields(modelName)?.includes(key)
        ) {
            continue;
        }
        walkReadResult(value, '*', dek);
    }
}

// ─── Middleware registration ─────────────────────────────────────────

let installed = false;

/**
 * Register the encryption middleware on the given Prisma client.
 * Idempotent — subsequent calls on the same client no-op.
 *
 * Install once at process boot alongside `pii-middleware` +
 * `soft-delete` + `audit`. Install order doesn't matter
 * cryptographically; audit logs any rotation / mismatch warnings on
 * the same log stream either way.
 */
export function registerEncryptionMiddleware(client: PrismaClient): void {
    if (installed) return;
    installed = true;

    client.$use(async (params, next) => {
        const model = params.model;
        const isWrite = WRITE_ACTIONS.has(params.action);
        const isRead = RESULT_DECRYPT_ACTIONS.has(params.action);

        // Pre-resolve the DEK once for the whole operation. Cache
        // hit after the first lookup per tenant in this process.
        // For models with no manifest involvement AND no nested
        // encrypted relations, the traversal is a no-op anyway, so
        // we could skip the lookup — but the cost is one `Map.get`
        // on the hot path and the code is simpler when we always
        // pre-resolve.
        const dek: Buffer | null = (isWrite || isRead)
            ? await resolveTenantDek(model)
            : null;

        // ── Write path ──
        if (isWrite) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const args = params.args as any;
            const targetModel =
                model && isEncryptedModel(model) ? model : '*';

            if (args?.data) walkWriteArgument(args.data, targetModel, dek);
            if (params.action === 'upsert') {
                if (args?.create) walkWriteArgument(args.create, targetModel, dek);
                if (args?.update) walkWriteArgument(args.update, targetModel, dek);
            }
        }

        const result = await next(params);

        // ── Read / result-decrypt path ──
        if (isRead) {
            const targetModel =
                model && isEncryptedModel(model) ? model : '*';
            walkReadResult(result, targetModel, dek);
        }

        return result;
    });
}

// ─── Test-only helpers ───────────────────────────────────────────────

/** @internal — test hook that resets the install guard. */
export function _resetEncryptionMiddlewareForTests(): void {
    installed = false;
}

/** @internal — exposed for direct unit-testing of the traversal logic. */
export const _internals = {
    walkWriteArgument,
    walkReadResult,
    encryptDataNode,
    decryptResultNode,
    resolveTenantDek,
};
