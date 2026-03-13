import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';

export class MappingRepository {
    static async getControlsWithEvidence(db: PrismaTx, ctx: RequestContext) {
        return db.control.findMany({
            where: { OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] },
            include: {
                evidence: { where: { tenantId: ctx.tenantId } },
                _count: { select: { evidence: true } },
            },
        });
    }
}
