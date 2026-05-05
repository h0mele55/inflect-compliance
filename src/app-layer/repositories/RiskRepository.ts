import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';
import { Prisma } from '@prisma/client';
import { buildCursorWhere, CURSOR_ORDER_BY, computePageInfo, clampLimit } from '@/lib/pagination';
import type { PaginatedResponse } from '@/lib/dto/pagination';
import { traceRepository } from '@/lib/observability/repository-tracing';

export interface RiskFilters {
    status?: string;
    scoreMin?: number;
    scoreMax?: number;
    category?: string;
    ownerUserId?: string;
    q?: string;
}

export interface RiskListParams {
    limit?: number;
    cursor?: string;
    filters?: RiskFilters;
}

const riskIncludes = {
    controls: { include: { control: { select: { id: true, name: true, annexId: true, status: true } } } },
};

export class RiskRepository {
    /**
     * List risks scoped to tenant (unpaginated — backward compat).
     */
    static async list(
        db: PrismaTx,
        ctx: RequestContext,
        filters: RiskFilters = {},
        options: { take?: number } = {},
    ) {
        return traceRepository('risk.list', ctx, async () => {
            const where = RiskRepository._buildWhere(ctx, filters);
            return db.risk.findMany({
                where,
                orderBy: { inherentScore: 'desc' },
                include: riskIncludes,
                ...(options.take ? { take: options.take } : {}),
            });
        });
    }

    static async listPaginated(db: PrismaTx, ctx: RequestContext, params: RiskListParams): Promise<PaginatedResponse<unknown>> {
        return traceRepository('risk.listPaginated', ctx, async () => {
            const limit = clampLimit(params.limit);
            const where = RiskRepository._buildWhere(ctx, params.filters);

            const cursorWhere = buildCursorWhere(params.cursor);
            if (cursorWhere) {
                where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), cursorWhere as Prisma.RiskWhereInput];
            }

            const items = await db.risk.findMany({
                where,
                orderBy: CURSOR_ORDER_BY,
                take: limit + 1,
                include: riskIncludes,
            });

            const { trimmedItems, nextCursor, hasNextPage } = computePageInfo(items, limit);
            return { items: trimmedItems, pageInfo: { nextCursor, hasNextPage } };
        });
    }

    private static _buildWhere(ctx: RequestContext, filters: RiskFilters = {}): Prisma.RiskWhereInput {
        const where: Prisma.RiskWhereInput = { tenantId: ctx.tenantId };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (filters.status) where.status = filters.status as any;
        if (filters.scoreMin !== undefined || filters.scoreMax !== undefined) {
            where.score = {};
            if (filters.scoreMin !== undefined) where.score.gte = filters.scoreMin;
            if (filters.scoreMax !== undefined) where.score.lte = filters.scoreMax;
        }
        if (filters.category) where.category = filters.category;
        if (filters.ownerUserId) where.ownerUserId = filters.ownerUserId;
        if (filters.q) {
            where.OR = [
                { title: { contains: filters.q, mode: 'insensitive' } },
                { description: { contains: filters.q, mode: 'insensitive' } },
                { category: { contains: filters.q, mode: 'insensitive' } },
            ];
        }

        return where;
    }

    /**
     * Get a single risk by ID, scoped to tenant.
     */
    static async getById(db: PrismaTx, ctx: RequestContext, id: string) {
        return traceRepository('risk.getById', ctx, async () => {
            return db.risk.findFirst({
                where: { id, tenantId: ctx.tenantId },
                include: {
                    controls: { include: { control: true } },
                },
            });
        });
    }

    /**
     * Create a risk scoped to tenant.
     */
    static async create(db: PrismaTx, ctx: RequestContext, data: Omit<Prisma.RiskUncheckedCreateInput, 'tenantId'>) {
        return traceRepository('risk.create', ctx, async () => {
            return db.risk.create({
                data: {
                    ...data,
                    tenantId: ctx.tenantId,
                },
            });
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
