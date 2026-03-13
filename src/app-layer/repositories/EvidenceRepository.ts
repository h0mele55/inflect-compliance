import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';
import { Prisma } from '@prisma/client';

export class EvidenceRepository {
    static async list(db: PrismaTx, ctx: RequestContext) {
        return db.evidence.findMany({
            where: { tenantId: ctx.tenantId },
            orderBy: { createdAt: 'desc' },
            include: {
                control: { select: { id: true, name: true, annexId: true } },
                reviews: { orderBy: { createdAt: 'desc' }, take: 1 },
            },
        });
    }

    static async getById(db: PrismaTx, ctx: RequestContext, id: string) {
        return db.evidence.findFirst({
            where: { id, tenantId: ctx.tenantId },
            include: {
                control: true,
                reviews: { include: { reviewer: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' } },
            },
        });
    }

    static async create(db: PrismaTx, ctx: RequestContext, data: Omit<Prisma.EvidenceUncheckedCreateInput, 'tenantId'>) {
        return db.evidence.create({
            data: {
                ...data,
                tenantId: ctx.tenantId,
            },
        });
    }

    static async update(db: PrismaTx, ctx: RequestContext, id: string, data: Omit<Prisma.EvidenceUncheckedUpdateInput, 'tenantId'>) {
        const existing = await this.getById(db, ctx, id);
        if (!existing) return null;

        return db.evidence.update({
            where: { id },
            data,
        });
    }

    static async addReview(db: PrismaTx, ctx: RequestContext, evidenceId: string, action: 'SUBMITTED' | 'APPROVED' | 'REJECTED', comment?: string | null) {
        return db.evidenceReview.create({
            data: {
                evidenceId,
                reviewerId: ctx.userId,
                action,
                comment,
            },
        });
    }
}
