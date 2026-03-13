import { PrismaClient } from '@prisma/client';
import { env } from '@/env';
import { getAuditContext } from './audit-context';
import { redactSensitiveFields, extractChangedFields } from './audit-redact';
import { registerSoftDeleteMiddleware } from './soft-delete';

// ─── Write actions to intercept ───
const WRITE_ACTIONS = new Set([
    'create',
    'createMany',
    'update',
    'updateMany',
    'delete',
    'deleteMany',
    'upsert',
]);

// Actions that have before/after diff potential
const DIFF_ACTIONS = new Set(['update', 'upsert']);

// ─── Models to exclude from audit logging ───
const EXCLUDED_MODELS = new Set([
    'AuditLog', // Prevent infinite recursion
]);

/**
 * Simple cuid-like ID generator for audit log entries.
 */
function generateCuid(): string {
    const uuid = require('crypto').randomUUID().replace(/-/g, '');
    return 'c' + uuid.substring(0, 24);
}

/**
 * Build diff JSON for update/upsert operations.
 *
 * Strategy (pragmatic):
 * - Extract changedFields from params.args.data keys
 * - Extract redacted "after" values from the operation result
 * - Optionally include "before" snapshot for single-record updates
 *   (only if we can fetch it cheaply via the where clause)
 *
 * LIMITATION: We do NOT fetch "before" from the DB because:
 * 1. It would add latency to every update
 * 2. The record might already be changed by the time we read it
 * 3. For multi-tenant RLS contexts, a separate query might fail
 * Instead we capture changedFields + after snapshot.
 */
function buildDiffJson(
    action: string,
    data: Record<string, any> | null | undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result: any,
): Record<string, any> | null {
    if (!DIFF_ACTIONS.has(action) || !data) return null;

    const changedFields = extractChangedFields(data);
    if (changedFields.length === 0) return null;

    // Build redacted "after" snapshot from result, limited to changed fields
    const afterRaw: Record<string, any> = {};
    for (const field of changedFields) {
        if (result && field in result) {
            afterRaw[field] = result[field];
        }
    }

    const after = redactSensitiveFields(afterRaw);

    return {
        changedFields,
        after,
    };
}

/**
 * Register audit middleware on a PrismaClient instance.
 * Automatically logs all write operations to AuditLog via raw SQL.
 *
 * Features:
 * - Diff capture for update/upsert (changedFields + redacted after)
 * - Redaction of sensitive fields in metadata and diffs
 * - Best-effort logging (never breaks the original operation)
 *
 * MUST only be called in Node.js runtime (not Edge).
 */
function registerAuditMiddleware(client: PrismaClient): void {
    client.$use(async (params, next) => {
        // Skip non-write actions (reads, aggregations, etc.)
        if (!WRITE_ACTIONS.has(params.action)) {
            return next(params);
        }

        // Skip excluded models to prevent recursion
        if (params.model && EXCLUDED_MODELS.has(params.model)) {
            return next(params);
        }

        // ⚠️ CRITICAL: Capture audit context BEFORE calling next(params).
        // Prisma's next() runs in a detached async context.
        const ctx = getAuditContext();
        const tenantId = ctx?.tenantId;

        // We need a tenantId for AuditLog's required FK — skip if absent
        if (!tenantId) {
            return next(params);
        }

        const actorUserId = ctx?.actorUserId || null;
        const requestId = ctx?.requestId || null;
        const source = ctx?.source || 'api';

        // Capture update data BEFORE next() for diff
        // For upsert, the update payload is in params.args.update, not params.args.data
        const updateData = params.action === 'upsert'
            ? params.args?.update ?? null
            : params.args?.data ?? null;

        // Execute the original operation first — never block it
        const result = await next(params);

        // Best-effort audit logging — never throw
        try {
            const model = params.model || 'Unknown';
            const action = params.action.toUpperCase();

            // Extract record ID(s) from the result
            let entityId = 'unknown';
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let recordIds: any = null;

            if (params.action === 'create' || params.action === 'update' || params.action === 'upsert' || params.action === 'delete') {
                entityId = result?.id || 'unknown';
            } else if (params.action === 'createMany') {
                entityId = 'batch';
                recordIds = { count: result?.count ?? 0 };
            } else if (params.action === 'updateMany' || params.action === 'deleteMany') {
                entityId = 'batch';
                recordIds = { count: result?.count ?? 0 };
            }

            // Build safe metadata (no raw data payloads, no secrets)
            const metadataJson: Record<string, any> = { source };

            // For *Many operations, include a safe summary of the filter
            if (params.args?.where && (params.action === 'updateMany' || params.action === 'deleteMany')) {
                metadataJson.filterKeys = Object.keys(params.args.where);
            }

            // Build diff for update/upsert
            const diffJson = buildDiffJson(params.action, updateData, result);

            // Use $executeRawUnsafe with parameterized values to bypass middleware recursion
            const id = generateCuid();
            await client.$executeRawUnsafe(
                `INSERT INTO "AuditLog" ("id", "tenantId", "userId", "entity", "entityId", "action", "details", "requestId", "recordIds", "metadataJson", "diffJson", "createdAt")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, NOW())`,
                id,
                tenantId,
                actorUserId,
                model,
                entityId,
                action,
                null,
                requestId,
                recordIds ? JSON.stringify(recordIds) : null,
                JSON.stringify(metadataJson),
                diffJson ? JSON.stringify(diffJson) : null,
            );
        } catch (auditError) {
            // Best effort — never break the original operation
            if (env.NODE_ENV === 'development') {
                console.warn('[audit-middleware] Failed to write audit log:', auditError);
            }
        }

        return result;
    });
}

// ─── Singleton ───

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient;
    prismaAuditMiddlewareRegistered?: boolean;
};

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// ── Register middlewares (Node.js runtime only) ──
// Edge Runtime (Next.js middleware) imports this module via auth.ts → PrismaAdapter.
// $use is NOT supported in Edge Runtime, so we guard with a typeof check.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof (globalThis as any).EdgeRuntime === 'undefined' && !globalForPrisma.prismaAuditMiddlewareRegistered) {
    // Soft-delete middleware MUST be registered BEFORE audit middleware
    // so audit sees the transformed operations (delete → update)
    registerSoftDeleteMiddleware(prisma);
    registerAuditMiddleware(prisma);
    globalForPrisma.prismaAuditMiddlewareRegistered = true;
}

/**
 * Explicit global export for admin operations / scripts that need
 * to bypass RLS by running without a tenant context.
 */
export function getPrisma() {
    return prisma;
}

export { withTenantDb } from './db-context';

export default prisma;
