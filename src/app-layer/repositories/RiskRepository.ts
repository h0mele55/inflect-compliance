import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';
import { Prisma } from '@prisma/client';

export interface RiskFilters {
    status?: string;
    category?: string;
    ownerUserId?: string;
    q?: string;
}

export class RiskRepository {
    /**
     * List risks scoped to tenant.
     */
    static async list(db: PrismaTx, ctx: RequestContext, filters: RiskFilters = {}) {
        const where: Prisma.RiskWhereInput = {
            tenantId: ctx.tenantId,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (filters.status) where.status = filters.status as any;
        if (filters.category) where.category = filters.category;
        if (filters.ownerUserId) where.ownerUserId = filters.ownerUserId;
        if (filters.q) {
            where.title = { contains: filters.q, mode: 'insensitive' };
        }

        return db.risk.findMany({
            where,
            orderBy: { inherentScore: 'desc' },
            include: {
                controls: { include: { control: { select: { id: true, name: true, annexId: true, status: true } } } },
            },
        });
    }

    /**
     * Get a single risk by ID, scoped to tenant.
     */
    static async getById(db: PrismaTx, ctx: RequestContext, id: string) {
        return db.risk.findFirst({
            where: { id, tenantId: ctx.tenantId },
            include: {
                controls: { include: { control: true } },
            },
        });
    }

    /**
     * Create a risk scoped to tenant.
     */
    static async create(db: PrismaTx, ctx: RequestContext, data: Omit<Prisma.RiskUncheckedCreateInput, 'tenantId'>) {
        return db.risk.create({
            data: {
                ...data,
                tenantId: ctx.tenantId,
            },
        });
    }

    /**
     * Update a risk, enforcing tenant ownership.
     */
    static async update(db: PrismaTx, ctx: RequestContext, id: string, data: Omit<Prisma.RiskUncheckedUpdateInput, 'tenantId'>) {
        const existing = await this.getById(db, ctx, id);
        if (!existing) return null;

        return db.risk.update({
            where: { id },
            data,
        });
    }

    /**
     * Delete a risk, enforcing tenant ownership.
     */
    static async delete(db: PrismaTx, ctx: RequestContext, id: string) {
        const existing = await this.getById(db, ctx, id);
        if (!existing) return false;

        await db.risk.delete({ where: { id } });
        return true;
    }

    /**
     * Link a control to a risk.
     */
    static async linkControl(db: PrismaTx, ctx: RequestContext, riskId: string, controlId: string) {
        const existing = await this.getById(db, ctx, riskId);
        if (!existing) return null;

        return db.riskControl.create({
            data: { tenantId: ctx.tenantId, riskId, controlId },
        });
    }

    /**
     * Unlink a control from a risk.
     */
    static async unlinkControl(db: PrismaTx, ctx: RequestContext, riskId: string, controlId: string) {
        const existing = await this.getById(db, ctx, riskId);
        if (!existing) return null;

        const link = await db.riskControl.findFirst({
            where: { riskId, controlId, tenantId: ctx.tenantId },
        });
        if (!link) return null;

        await db.riskControl.delete({ where: { id: link.id } });
        return true;
    }
}

