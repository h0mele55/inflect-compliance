import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';

export class NotificationRepository {
    static async listMine(db: PrismaTx, ctx: RequestContext) {
        return db.notification.findMany({
            where: { tenantId: ctx.tenantId, userId: ctx.userId },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
    }

    static async markAsRead(db: PrismaTx, ctx: RequestContext, id: string) {
        return db.notification.updateMany({
            where: { id, tenantId: ctx.tenantId, userId: ctx.userId },
            data: { read: true },
        });
    }
}
