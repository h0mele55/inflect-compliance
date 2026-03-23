/**
 * Soft-Delete Middleware for Prisma
 *
 * Transforms hard deletes into soft deletes (setting deletedAt) and
 * automatically filters out soft-deleted records from reads.
 *
 * ALLOWLIST: Only models listed in SOFT_DELETE_MODELS are affected.
 * All other models retain hard-delete semantics.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { getAuditContext } from './audit-context';

// ─── Models that support soft delete ───
// Must match SOFT_DELETE_TARGETS in src/lib/security/classification.ts
export const SOFT_DELETE_MODELS = new Set([
    // P0 — already had deletedAt
    'Asset',
    'Risk',
    'Control',
    'Evidence',
    'Policy',
    // P1 — added in soft-delete rollout migration
    'Vendor',
    'FileRecord',
    // P2
    'Task',
    'Finding',
    // P3
    'Audit',
    'AuditCycle',
    'AuditPack',
]);

// ─── Read actions that should filter out deleted records ───
const READ_ACTIONS = new Set([
    'findUnique',
    'findFirst',
    'findMany',
    'count',
    'aggregate',
    'groupBy',
]);

// ─── Delete actions to intercept ───
const DELETE_ACTIONS = new Set(['delete', 'deleteMany']);

// ─── Internal flag for opt-out ───
const INCLUDE_DELETED_KEY = '__includeDeleted';

/**
 * Helper to opt out of soft-delete read filtering.
 * Usage: db.asset.findMany(withDeleted({ where: { tenantId } }))
 *
 * Sets a magic key that the middleware strips before passing to Prisma.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withDeleted<T extends Record<string, any>>(args: T): T {
    return { ...args, [INCLUDE_DELETED_KEY]: true };
}

/**
 * Register soft-delete middleware on a PrismaClient instance.
 * MUST be called BEFORE audit middleware so audit sees the transformed ops.
 */
export function registerSoftDeleteMiddleware(client: PrismaClient): void {
    client.$use(async (params, next) => {
        const model = params.model;

        // Only apply to allowlisted models
        if (!model || !SOFT_DELETE_MODELS.has(model)) {
            return next(params);
        }

        // ─── DELETE INTERCEPTION ───
        if (DELETE_ACTIONS.has(params.action)) {
            // Get the current user from audit context for deletedByUserId
            const ctx = getAuditContext();
            const deletedByUserId = ctx?.actorUserId || null;

            if (params.action === 'delete') {
                // Transform delete → update
                params.action = 'update';
                params.args.data = {
                    deletedAt: new Date(),
                    deletedByUserId,
                };
            } else if (params.action === 'deleteMany') {
                // Transform deleteMany → updateMany
                params.action = 'updateMany';
                params.args.data = {
                    deletedAt: new Date(),
                    deletedByUserId,
                };
            }

            return next(params);
        }

        // ─── READ FILTERING ───
        if (READ_ACTIONS.has(params.action)) {
            // Check for opt-out flag
            if (params.args?.[INCLUDE_DELETED_KEY]) {
                // Strip the flag before passing to Prisma
                delete params.args[INCLUDE_DELETED_KEY];
                return next(params);
            }

            // Check if caller explicitly set a deletedAt filter (e.g. { deletedAt: { not: null } })
            if (params.args?.where?.deletedAt !== undefined) {
                // Caller explicitly controls deletedAt — don't override
                return next(params);
            }

            // Inject deletedAt: null filter
            if (!params.args) params.args = {};
            if (!params.args.where) params.args.where = {};
            params.args.where.deletedAt = null;

            return next(params);
        }

        return next(params);
    });
}
