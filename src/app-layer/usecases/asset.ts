import { RequestContext } from '../types';
import { AssetRepository } from '../repositories/AssetRepository';
import { assertCanRead, assertCanWrite, assertCanAdmin } from '../policies/common';
import { logEvent } from '../events/audit';
import { notFound } from '@/lib/errors/types';
import { runInTenantContext } from '@/lib/db-context';

export async function listAssets(ctx: RequestContext) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        AssetRepository.list(db, ctx)
    );
}

export async function getAsset(ctx: RequestContext, id: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const asset = await AssetRepository.getById(db, ctx, id);
        if (!asset) throw notFound('Asset not found');
        return asset;
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createAsset(ctx: RequestContext, data: any) {
    assertCanWrite(ctx);

    return runInTenantContext(ctx, async (db) => {
        const asset = await AssetRepository.create(db, ctx, {
            name: data.name,
            type: data.type,
            classification: data.classification,
            owner: data.owner,
            location: data.location,
            confidentiality: data.confidentiality,
            integrity: data.integrity,
            availability: data.availability,
            dependencies: data.dependencies,
            businessProcesses: data.businessProcesses,
            dataResidency: data.dataResidency,
            retention: data.retention,
        });

        await logEvent(db, ctx, {
            action: 'CREATE',
            entityType: 'Asset',
            entityId: asset.id,
            details: `Created asset: ${asset.name}`,
        });

        return asset;
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateAsset(ctx: RequestContext, id: string, data: any) {
    assertCanWrite(ctx);

    return runInTenantContext(ctx, async (db) => {
        const asset = await AssetRepository.update(db, ctx, id, {
            name: data.name,
            type: data.type,
            classification: data.classification,
            owner: data.owner,
            location: data.location,
            confidentiality: data.confidentiality,
            integrity: data.integrity,
            availability: data.availability,
            dependencies: data.dependencies,
            businessProcesses: data.businessProcesses,
            dataResidency: data.dataResidency,
            retention: data.retention,
        });

        if (!asset) throw notFound('Asset not found');

        await logEvent(db, ctx, {
            action: 'UPDATE',
            entityType: 'Asset',
            entityId: id,
            details: JSON.stringify(data),
        });

        return asset;
    });
}

export async function deleteAsset(ctx: RequestContext, id: string) {
    assertCanAdmin(ctx);

    return runInTenantContext(ctx, async (db) => {
        const deleted = await AssetRepository.delete(db, ctx, id);
        if (!deleted) throw notFound('Asset not found');

        await logEvent(db, ctx, {
            action: 'SOFT_DELETE',
            entityType: 'Asset',
            entityId: id,
            details: 'Asset soft-deleted',
        });

        return { success: true };
    });
}

// ─── Restore / Purge / Include Deleted ───

import { restoreEntity, purgeEntity } from './soft-delete-operations';
import { withDeleted } from '@/lib/soft-delete';

export async function restoreAsset(ctx: RequestContext, id: string) {
    return restoreEntity(ctx, 'Asset', id);
}

export async function purgeAsset(ctx: RequestContext, id: string) {
    return purgeEntity(ctx, 'Asset', id);
}

export async function listAssetsWithDeleted(ctx: RequestContext) {
    assertCanAdmin(ctx);
    return runInTenantContext(ctx, (db) =>
        db.asset.findMany(withDeleted({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: 'desc' as const } }))
    );
}
