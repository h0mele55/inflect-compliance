import { RequestContext } from '../types';
import { FileRepository } from '../repositories/FileRepository';
import { assertCanRead } from '../policies/common';
import { notFound, forbidden } from '@/lib/errors/types';
import { getFile } from '@/lib/storage';
import { logEvent } from '../events/audit';
import { runInTenantContext } from '@/lib/db-context';
import { logger } from '@/lib/observability/logger';

export async function downloadFile(ctx: RequestContext, fileName: string) {
    assertCanRead(ctx);
    logger.info('file download started', { component: 'file', fileName });

    return runInTenantContext(ctx, async (db) => {
        const isOwned = await FileRepository.isFileOwnedByTenant(db, ctx, fileName);
        if (!isOwned) {
            throw forbidden('You do not have permission to access this file');
        }

        const fileData = await getFile(fileName);
        if (!fileData) {
            throw notFound('File not found on disk');
        }

        await logEvent(db, ctx, {
            action: 'READ',
            entityType: 'File',
            entityId: fileName,
            details: `Downloaded file: ${fileData.name}`,
        });

        return fileData;
    });
}
