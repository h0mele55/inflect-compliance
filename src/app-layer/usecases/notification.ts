import { RequestContext } from '../types';
import { NotificationRepository } from '../repositories/NotificationRepository';
import { assertCanRead } from '../policies/common';
import { runInTenantContext } from '@/lib/db-context';

export async function listMyNotifications(ctx: RequestContext) {
    assertCanRead(ctx); // Every user can read their own
    return runInTenantContext(ctx, (db) =>
        NotificationRepository.listMine(db, ctx)
    );
}

export async function markNotificationRead(ctx: RequestContext, id: string) {
    assertCanRead(ctx); // Every user can write (mark read) their own
    return runInTenantContext(ctx, async (db) => {
        await NotificationRepository.markAsRead(db, ctx, id);
        return { success: true };
    });
}
