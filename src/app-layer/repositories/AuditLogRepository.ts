import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';

export class AuditLogRepository {
    static async list(db: PrismaTx, ctx: RequestContext) {
        return db.auditLog.findMany({
            where: { tenantId: ctx.tenantId },
            orderBy: { createdAt: 'desc' },
            take: 100,
            include: { user: { select: { name: true, email: true } } },
        });
    }
}
