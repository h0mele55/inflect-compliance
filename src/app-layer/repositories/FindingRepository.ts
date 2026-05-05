import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';
import { Prisma } from '@prisma/client';

export class FindingRepository {
    static async list(
        db: PrismaTx,
        ctx: RequestContext,
        options: { take?: number } = {},
    ) {
        return db.finding.findMany({
            where: { tenantId: ctx.tenantId },
            orderBy: { createdAt: 'desc' },
            include: { audit: { select: { id: true, title: true } } },
            ...(options.take ? { take: options.take } : {}),
        });
    }

    static async getById(db: PrismaTx, ctx: RequestContext, id: string) {
        return db.finding.findFirst({
            where: { id, tenantId: ctx.tenantId },
            include: {
                audit: { select: { id: true, title: true } },
                evidenceLinks: { include: { evidence: true } },
            },
        });
    }

    static async create(db: PrismaTx, ctx: RequestContext, data: Omit<Prisma.FindingUncheckedCreateInput, 'tenantId'>) {
        return db.finding.create({
            data: {
                ...data,
                tenantId: ctx.tenantId,
            },
        });
    }

    static async update(db: PrismaTx, ctx: RequestContext, id: string, data: Omit<Prisma.FindingUncheckedUpdateInput, 'tenantId'>) {
        const existing = await this.getById(db, ctx, id);
        if (!existing) return null;

        return db.finding.update({
            where: { id },
            data,
        });
    }
}
