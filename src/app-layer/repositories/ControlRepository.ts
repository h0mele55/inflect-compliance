import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';
import { Prisma } from '@prisma/client';
import { buildCursorWhere, CURSOR_ORDER_BY, computePageInfo, clampLimit } from '@/lib/pagination';
import type { PaginatedResponse } from '@/lib/dto/pagination';

export interface ControlListFilters {
    status?: string;
    applicability?: string;
    ownerUserId?: string;
    q?: string;
    category?: string;
}

export interface ControlListParams {
    limit?: number;
    cursor?: string;
    filters?: ControlListFilters;
}

export class ControlRepository {
    static async list(db: PrismaTx, ctx: RequestContext, filters?: ControlListFilters) {
        const where = ControlRepository._buildWhere(ctx, filters);

        return db.control.findMany({
            where,
            orderBy: [{ code: 'asc' }, { annexId: 'asc' }],
            include: {
                owner: { select: { id: true, name: true, email: true } },
                _count: { select: { evidence: true, risks: true, assets: true, controlTasks: true, evidenceLinks: true, contributors: true } },
            },
        });
    }

    static async listPaginated(db: PrismaTx, ctx: RequestContext, params: ControlListParams): Promise<PaginatedResponse<unknown>> {
        const limit = clampLimit(params.limit);
        const where = ControlRepository._buildWhere(ctx, params.filters);

        // Apply cursor
        const cursorWhere = buildCursorWhere(params.cursor);
        if (cursorWhere) {
            where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), cursorWhere];
        }

        const items = await db.control.findMany({
            where,
            orderBy: CURSOR_ORDER_BY,
            take: limit + 1,
            include: {
                owner: { select: { id: true, name: true, email: true } },
                _count: { select: { evidence: true, risks: true, assets: true, controlTasks: true, evidenceLinks: true, contributors: true } },
            },
        });

        const { trimmedItems, nextCursor, hasNextPage } = computePageInfo(items, limit);
        return { items: trimmedItems, pageInfo: { nextCursor, hasNextPage } };
    }

    private static _buildWhere(ctx: RequestContext, filters?: ControlListFilters): Prisma.ControlWhereInput {
        const where: Prisma.ControlWhereInput = {
            OR: [{ tenantId: ctx.tenantId }, { tenantId: null }],
        };

        if (filters?.status) where.status = filters.status as Prisma.EnumControlStatusFilter;
        if (filters?.applicability && (filters.applicability === 'APPLICABLE' || filters.applicability === 'NOT_APPLICABLE')) {
            where.applicability = filters.applicability;
        }
        if (filters?.ownerUserId) where.ownerUserId = filters.ownerUserId;
        if (filters?.category) where.category = filters.category;
        if (filters?.q) {
            where.AND = [{
                OR: [
                    { name: { contains: filters.q, mode: 'insensitive' } },
                    { code: { contains: filters.q, mode: 'insensitive' } },
                    { description: { contains: filters.q, mode: 'insensitive' } },
                ],
            }];
        }

        return where;
    }

    static async getById(db: PrismaTx, ctx: RequestContext, id: string) {
        return db.control.findFirst({
            where: {
                id,
                OR: [{ tenantId: ctx.tenantId }, { tenantId: null }],
            },
            include: {
                owner: { select: { id: true, name: true, email: true } },
                createdBy: { select: { id: true, name: true, email: true } },
                applicabilityDecidedBy: { select: { id: true, name: true, email: true } },
                contributors: { include: { user: { select: { id: true, name: true, email: true } } } },
                controlTasks: { orderBy: { createdAt: 'desc' }, include: { assignee: { select: { id: true, name: true, email: true } } } },
                evidenceLinks: { orderBy: { createdAt: 'desc' }, include: { createdBy: { select: { id: true, name: true } } } },
                evidence: { where: { tenantId: ctx.tenantId }, orderBy: { createdAt: 'desc' } },
                risks: { include: { risk: { select: { id: true, title: true, inherentScore: true } } } },
                policyLinks: { include: { policy: { select: { id: true, title: true, status: true } } } },
                frameworkMappings: { include: { fromRequirement: { include: { framework: { select: { name: true } } } } } },
                _count: { select: { evidence: true, risks: true, assets: true, controlTasks: true, evidenceLinks: true, contributors: true } },
            },
        });
    }

    static async create(db: PrismaTx, ctx: RequestContext, data: Omit<Prisma.ControlUncheckedCreateInput, 'tenantId'>) {
        return db.control.create({
            data: {
                ...data,
                tenantId: ctx.tenantId,
            },
        });
    }

    static async update(db: PrismaTx, ctx: RequestContext, id: string, data: Omit<Prisma.ControlUncheckedUpdateInput, 'tenantId'>) {
        const existing = await db.control.findFirst({
            where: { id, tenantId: ctx.tenantId }
        });
        if (!existing) return null;

        return db.control.update({
            where: { id },
            data,
        });
    }

    static async setApplicability(
        db: PrismaTx,
        ctx: RequestContext,
        id: string,
        applicability: 'APPLICABLE' | 'NOT_APPLICABLE',
        justification: string | null
    ) {
        const existing = await db.control.findFirst({
            where: { id, tenantId: ctx.tenantId },
        });
        if (!existing) return null;

        return db.control.update({
            where: { id },
            data: {
                applicability,
                applicabilityJustification: applicability === 'NOT_APPLICABLE' ? justification : null,
                applicabilityDecidedByUserId: ctx.userId,
                applicabilityDecidedAt: new Date(),
            },
            include: {
                applicabilityDecidedBy: { select: { id: true, name: true, email: true } },
            },
        });
    }

    static async setOwner(db: PrismaTx, ctx: RequestContext, id: string, ownerUserId: string | null) {
        const existing = await db.control.findFirst({ where: { id, tenantId: ctx.tenantId } });
        if (!existing) return null;
        return db.control.update({
            where: { id },
            data: { ownerUserId },
            include: { owner: { select: { id: true, name: true, email: true } } },
        });
    }

    // ─── Contributors ───

    static async listContributors(db: PrismaTx, ctx: RequestContext, controlId: string) {
        return db.controlContributor.findMany({
            where: { controlId, tenantId: ctx.tenantId },
            include: { user: { select: { id: true, name: true, email: true } } },
        });
    }

    static async addContributor(db: PrismaTx, ctx: RequestContext, controlId: string, userId: string) {
        const control = await db.control.findFirst({ where: { id: controlId, tenantId: ctx.tenantId } });
        if (!control) return null;
        return db.controlContributor.create({
            data: { tenantId: ctx.tenantId, controlId, userId },
            include: { user: { select: { id: true, name: true, email: true } } },
        });
    }

    static async removeContributor(db: PrismaTx, ctx: RequestContext, controlId: string, userId: string) {
        const control = await db.control.findFirst({ where: { id: controlId, tenantId: ctx.tenantId } });
        if (!control) return null;
        const link = await db.controlContributor.findFirst({ where: { controlId, userId } });
        if (!link) return null;
        await db.controlContributor.delete({ where: { id: link.id } });
        return true;
    }

    // ─── Tasks ───

    static async listTasks(db: PrismaTx, ctx: RequestContext, controlId: string) {
        return db.controlTask.findMany({
            where: { controlId, tenantId: ctx.tenantId },
            orderBy: { createdAt: 'asc' },
            include: { assignee: { select: { id: true, name: true, email: true } } },
        });
    }

    static async createTask(db: PrismaTx, ctx: RequestContext, controlId: string, data: { title: string; description?: string | null; assigneeUserId?: string | null; dueAt?: string | null }) {
        const control = await db.control.findFirst({ where: { id: controlId, tenantId: ctx.tenantId } });
        if (!control) return null;
        return db.controlTask.create({
            data: {
                tenantId: ctx.tenantId,
                controlId,
                title: data.title,
                description: data.description || null,
                assigneeUserId: data.assigneeUserId || null,
                dueAt: data.dueAt ? new Date(data.dueAt) : null,
            },
            include: { assignee: { select: { id: true, name: true, email: true } } },
        });
    }

    static async updateTask(db: PrismaTx, ctx: RequestContext, taskId: string, data: { title?: string; description?: string | null; status?: string; assigneeUserId?: string | null; dueAt?: string | null }) {
        const task = await db.controlTask.findFirst({ where: { id: taskId, tenantId: ctx.tenantId } });
        if (!task) return null;
        return db.controlTask.update({
            where: { id: taskId },
            data: {
                ...(data.title !== undefined && { title: data.title }),
                ...(data.description !== undefined && { description: data.description }),
                ...(data.status !== undefined && { status: data.status as 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED' }),
                ...(data.assigneeUserId !== undefined && { assigneeUserId: data.assigneeUserId }),
                ...(data.dueAt !== undefined && { dueAt: data.dueAt ? new Date(data.dueAt) : null }),
            },
            include: { assignee: { select: { id: true, name: true, email: true } } },
        });
    }

    static async deleteTask(db: PrismaTx, ctx: RequestContext, taskId: string) {
        const task = await db.controlTask.findFirst({ where: { id: taskId, tenantId: ctx.tenantId } });
        if (!task) return null;
        await db.controlTask.delete({ where: { id: taskId } });
        return true;
    }

    // ─── Evidence Links ───

    static async listEvidenceLinks(db: PrismaTx, ctx: RequestContext, controlId: string) {
        return db.controlEvidenceLink.findMany({
            where: { controlId, tenantId: ctx.tenantId },
            orderBy: { createdAt: 'desc' },
            include: { createdBy: { select: { id: true, name: true } } },
        });
    }

    static async linkEvidence(db: PrismaTx, ctx: RequestContext, controlId: string, data: { kind: string; fileId?: string | null; url?: string | null; note?: string | null }) {
        const control = await db.control.findFirst({ where: { id: controlId, tenantId: ctx.tenantId } });
        if (!control) return null;
        return db.controlEvidenceLink.create({
            data: {
                tenantId: ctx.tenantId,
                controlId,
                kind: data.kind as 'FILE' | 'LINK' | 'INTEGRATION_RESULT',
                fileId: data.fileId || null,
                url: data.url || null,
                note: data.note || null,
                createdByUserId: ctx.userId,
            },
            include: { createdBy: { select: { id: true, name: true } } },
        });
    }

    static async unlinkEvidence(db: PrismaTx, ctx: RequestContext, controlId: string, linkId: string) {
        const link = await db.controlEvidenceLink.findFirst({
            where: { id: linkId, controlId, tenantId: ctx.tenantId },
        });
        if (!link) return null;
        await db.controlEvidenceLink.delete({ where: { id: linkId } });
        return true;
    }

    // ─── Asset Linking ───

    static async linkAsset(db: PrismaTx, ctx: RequestContext, controlId: string, assetId: string) {
        const control = await db.control.findFirst({
            where: { id: controlId, tenantId: ctx.tenantId },
        });
        if (!control) return null;
        return db.controlAsset.create({
            data: { tenantId: ctx.tenantId, controlId, assetId },
        });
    }

    static async unlinkAsset(db: PrismaTx, ctx: RequestContext, controlId: string, assetId: string) {
        const control = await db.control.findFirst({
            where: { id: controlId, tenantId: ctx.tenantId },
        });
        if (!control) return null;
        const link = await db.controlAsset.findFirst({
            where: { controlId, assetId, tenantId: ctx.tenantId },
        });
        if (!link) return null;
        await db.controlAsset.delete({ where: { id: link.id } });
        return true;
    }
}
