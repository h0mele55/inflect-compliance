import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';
import { Prisma } from '@prisma/client';

export class AuditRepository {
    static async list(db: PrismaTx, ctx: RequestContext) {
        return db.audit.findMany({
            where: { tenantId: ctx.tenantId },
            orderBy: { createdAt: 'desc' },
            include: {
                _count: { select: { checklist: true, findings: true } },
            },
        });
    }

    static async getById(db: PrismaTx, ctx: RequestContext, id: string) {
        return db.audit.findFirst({
            where: { id, tenantId: ctx.tenantId },
            include: {
                checklist: { orderBy: { sortOrder: 'asc' } },
                findings: { orderBy: { createdAt: 'desc' } },
            },
        });
    }

    static async create(db: PrismaTx, ctx: RequestContext, data: Omit<Prisma.AuditUncheckedCreateInput, 'tenantId'>) {
        return db.audit.create({
            data: {
                ...data,
                tenantId: ctx.tenantId,
            },
        });
    }

    static async update(db: PrismaTx, ctx: RequestContext, id: string, data: Omit<Prisma.AuditUncheckedUpdateInput, 'tenantId'>) {
        const existing = await this.getById(db, ctx, id);
        if (!existing) return null;

        return db.audit.update({
            where: { id },
            data,
        });
    }

    static async createChecklistItem(db: PrismaTx, ctx: RequestContext, auditId: string, prompt: string, sortOrder: number) {
        return db.auditChecklistItem.create({
            data: {
                auditId,
                prompt,
                sortOrder,
            },
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static async updateChecklistItem(db: PrismaTx, ctx: RequestContext, itemId: string, data: { result: any, notes?: string }) {
        return db.auditChecklistItem.update({
            where: { id: itemId },
            data,
        });
    }
}
