/**
 * Shared Soft-Delete Operations Module
 *
 * Provides generic restoreEntity, purgeEntity functions for all soft-deletable models.
 * Avoids duplication across entity-specific usecase files.
 */
import { RequestContext } from '../types';
import { assertCanAdmin } from '../policies/common';
import { logEvent } from '../events/audit';
import { runInTenantContext } from '@/lib/db-context';
import { notFound } from '@/lib/errors/types';
import { withDeleted, SOFT_DELETE_MODELS } from '@/lib/soft-delete';

type SoftDeletableModel = 'Asset' | 'Risk' | 'Control' | 'Evidence' | 'Policy';

/**
 * Restore a soft-deleted entity (set deletedAt = null).
 * ADMIN only.
 */
export async function restoreEntity(
    ctx: RequestContext,
    model: SoftDeletableModel,
    id: string,
) {
    assertCanAdmin(ctx);

    return runInTenantContext(ctx, async (db) => {
        // We need to find the record including deleted ones
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const delegate = (db as any)[model.charAt(0).toLowerCase() + model.slice(1)];

        // Find the record (including deleted, using withDeleted pattern)
        const record = await delegate.findFirst(withDeleted({
            where: { id, tenantId: ctx.tenantId },
        }));
        if (!record) throw notFound(`${model} not found`);
        if (!record.deletedAt) throw notFound(`${model} is not deleted`);

        // Restore: set deletedAt and deletedByUserId to null
        const restored = await delegate.update({
            where: { id },
            data: { deletedAt: null, deletedByUserId: null },
        });

        await logEvent(db, ctx, {
            action: 'ENTITY_RESTORED',
            entityType: model,
            entityId: id,
            details: `${model} restored from soft-delete`,
            metadata: { previousDeletedAt: record.deletedAt },
        });

        return restored;
    });
}

/**
 * Permanently purge a soft-deleted entity (hard delete).
 * ADMIN only. Record must already be soft-deleted before purge.
 */
export async function purgeEntity(
    ctx: RequestContext,
    model: SoftDeletableModel,
    id: string,
) {
    assertCanAdmin(ctx);

    return runInTenantContext(ctx, async (db) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const delegate = (db as any)[model.charAt(0).toLowerCase() + model.slice(1)];

        // Find the record (including deleted)
        const record = await delegate.findFirst(withDeleted({
            where: { id, tenantId: ctx.tenantId },
        }));
        if (!record) throw notFound(`${model} not found`);
        if (!record.deletedAt) {
            throw notFound(`${model} must be soft-deleted before purging`);
        }

        // Hard delete: use $executeRawUnsafe to bypass the soft-delete middleware
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any).$executeRawUnsafe(
            `DELETE FROM "${model}" WHERE "id" = $1 AND "tenantId" = $2`,
            id,
            ctx.tenantId,
        );

        await logEvent(db, ctx, {
            action: 'ENTITY_PURGED',
            entityType: model,
            entityId: id,
            details: `${model} permanently purged`,
        });

        return { success: true, purged: true };
    });
}
