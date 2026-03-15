import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';
import { Prisma } from '@prisma/client';
import { buildCursorWhere, CURSOR_ORDER_BY, computePageInfo, clampLimit } from '@/lib/pagination';
import type { PaginatedResponse } from '@/lib/dto/pagination';

// ─── Filters ───

export interface TaskFilters {
    status?: string;
    type?: string;
    severity?: string;
    priority?: string;
    assigneeUserId?: string;
    controlId?: string;
    due?: 'overdue' | 'next7d';
    q?: string;
    linkedEntityType?: string;
    linkedEntityId?: string;
}

export interface TaskListParams {
    limit?: number;
    cursor?: string;
    filters?: TaskFilters;
}

const taskListIncludes = {
    assignee: { select: { id: true, name: true, email: true } },
    createdBy: { select: { id: true, name: true, email: true } },
    _count: { select: { links: true, comments: true, watchers: true } },
};

// ─── Task Repository ───

export class WorkItemRepository {
    static async list(db: PrismaTx, ctx: RequestContext, filters: TaskFilters = {}) {
        const where = WorkItemRepository._buildWhere(ctx, filters);
        return db.task.findMany({
            where,
            orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
            include: taskListIncludes,
        });
    }

    static async listPaginated(db: PrismaTx, ctx: RequestContext, params: TaskListParams): Promise<PaginatedResponse<unknown>> {
        const limit = clampLimit(params.limit);
        const where = WorkItemRepository._buildWhere(ctx, params.filters);

        const cursorWhere = buildCursorWhere(params.cursor);
        if (cursorWhere) {
            if (where.AND) {
                (where.AND as Prisma.TaskWhereInput[]).push(cursorWhere as Prisma.TaskWhereInput);
            } else {
                where.AND = [cursorWhere as Prisma.TaskWhereInput];
            }
        }

        const items = await db.task.findMany({
            where,
            orderBy: CURSOR_ORDER_BY,
            take: limit + 1,
            include: taskListIncludes,
        });

        const { trimmedItems, nextCursor, hasNextPage } = computePageInfo(items, limit);
        return { items: trimmedItems, pageInfo: { nextCursor, hasNextPage } };
    }

    private static _buildWhere(ctx: RequestContext, filters: TaskFilters = {}): Prisma.TaskWhereInput {
        const where: Prisma.TaskWhereInput = { tenantId: ctx.tenantId };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (filters.status) where.status = filters.status as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (filters.type) where.type = filters.type as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (filters.severity) where.severity = filters.severity as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (filters.priority) where.priority = filters.priority as any;
        if (filters.assigneeUserId) where.assigneeUserId = filters.assigneeUserId;
        if (filters.controlId) where.controlId = filters.controlId;
        if (filters.due === 'overdue') {
            where.dueAt = { lt: new Date() };
            where.status = { notIn: ['RESOLVED', 'CLOSED', 'CANCELED'] };
        } else if (filters.due === 'next7d') {
            const now = new Date();
            const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            where.dueAt = { gte: now, lte: in7 };
            where.status = { notIn: ['RESOLVED', 'CLOSED', 'CANCELED'] };
        }
        if (filters.q) {
            where.OR = [
                { title: { contains: filters.q, mode: 'insensitive' } },
                { key: { contains: filters.q, mode: 'insensitive' } },
            ];
        }
        if (filters.linkedEntityType && filters.linkedEntityId) {
            where.links = {
                some: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    entityType: filters.linkedEntityType as any,
                    entityId: filters.linkedEntityId,
                },
            };
        }

        return where;
    }

    static async getById(db: PrismaTx, ctx: RequestContext, id: string) {
        return db.task.findFirst({
            where: { id, tenantId: ctx.tenantId },
            include: {
                assignee: { select: { id: true, name: true, email: true } },
                createdBy: { select: { id: true, name: true, email: true } },
                reviewer: { select: { id: true, name: true, email: true } },
                control: { select: { id: true, code: true, name: true } },
                links: { orderBy: { createdAt: 'desc' } },
                comments: {
                    orderBy: { createdAt: 'asc' },
                    include: { createdBy: { select: { id: true, name: true, email: true } } },
                },
                watchers: {
                    include: { user: { select: { id: true, name: true, email: true } } },
                },
                _count: { select: { links: true, comments: true, watchers: true } },
            },
        });
    }

    static async create(db: PrismaTx, ctx: RequestContext, data: {
        title: string;
        type?: string;
        description?: string | null;
        severity?: string;
        priority?: string;
        source?: string;
        dueAt?: string | null;
        assigneeUserId?: string | null;
        reviewerUserId?: string | null;
        controlId?: string | null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metadataJson?: any;
    }) {
        // Generate key: TSK-<count+1>
        const count = await db.task.count({ where: { tenantId: ctx.tenantId } });
        const key = `TSK-${count + 1}`;

        return db.task.create({
            data: {
                tenantId: ctx.tenantId,
                key,
                title: data.title,
                description: data.description || null,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                type: (data.type as any) || 'TASK',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                severity: (data.severity as any) || 'MEDIUM',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                priority: (data.priority as any) || 'P2',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                source: (data.source as any) || 'MANUAL',
                dueAt: data.dueAt ? new Date(data.dueAt) : null,
                assigneeUserId: data.assigneeUserId || null,
                reviewerUserId: data.reviewerUserId || null,
                controlId: data.controlId || null,
                createdByUserId: ctx.userId,
                metadataJson: data.metadataJson || null,
            },
            include: {
                assignee: { select: { id: true, name: true, email: true } },
                createdBy: { select: { id: true, name: true, email: true } },
            },
        });
    }

    static async update(db: PrismaTx, ctx: RequestContext, id: string, data: {
        title?: string;
        description?: string | null;
        severity?: string;
        priority?: string;
        dueAt?: string | null;
        controlId?: string | null;
        reviewerUserId?: string | null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metadataJson?: any;
    }) {
        const existing = await db.task.findFirst({ where: { id, tenantId: ctx.tenantId } });
        if (!existing) return null;

        return db.task.update({
            where: { id },
            data: {
                ...(data.title !== undefined && { title: data.title }),
                ...(data.description !== undefined && { description: data.description }),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...(data.severity !== undefined && { severity: data.severity as any }),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...(data.priority !== undefined && { priority: data.priority as any }),
                ...(data.dueAt !== undefined && { dueAt: data.dueAt ? new Date(data.dueAt) : null }),
                ...(data.controlId !== undefined && { controlId: data.controlId }),
                ...(data.reviewerUserId !== undefined && { reviewerUserId: data.reviewerUserId }),
                ...(data.metadataJson !== undefined && { metadataJson: data.metadataJson }),
            },
        });
    }

    static async setStatus(db: PrismaTx, ctx: RequestContext, id: string, status: string, resolution?: string | null) {
        const existing = await db.task.findFirst({ where: { id, tenantId: ctx.tenantId } });
        if (!existing) return null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: any = { status: status as any };
        if (['RESOLVED', 'CLOSED', 'CANCELED'].includes(status)) {
            updateData.completedAt = new Date();
            if (resolution !== undefined) updateData.resolution = resolution;
        } else {
            updateData.completedAt = null;
        }

        return db.task.update({ where: { id }, data: updateData });
    }

    static async assign(db: PrismaTx, ctx: RequestContext, id: string, assigneeUserId: string | null) {
        const existing = await db.task.findFirst({ where: { id, tenantId: ctx.tenantId } });
        if (!existing) return null;

        return db.task.update({
            where: { id },
            data: { assigneeUserId },
            include: { assignee: { select: { id: true, name: true, email: true } } },
        });
    }

    // ─── Metrics ───

    static async metrics(db: PrismaTx, ctx: RequestContext) {
        const tenantId = ctx.tenantId;
        const now = new Date();
        const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const in30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const ago30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const openFilter = { notIn: ['RESOLVED', 'CLOSED', 'CANCELED'] as any[] };

        const [byStatus, bySeverity, byType, overdueCount, due7dCount, due30dCount, total, recentCreated, recentResolved] = await Promise.all([
            db.task.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
            db.task.groupBy({ by: ['severity'], where: { tenantId }, _count: true }),
            db.task.groupBy({ by: ['type'], where: { tenantId }, _count: true }),
            db.task.count({ where: { tenantId, dueAt: { lt: now }, status: openFilter } }),
            db.task.count({ where: { tenantId, dueAt: { gte: now, lte: in7d }, status: openFilter } }),
            db.task.count({ where: { tenantId, dueAt: { gte: now, lte: in30d }, status: openFilter } }),
            db.task.count({ where: { tenantId } }),
            db.task.count({ where: { tenantId, createdAt: { gte: ago30d } } }),
            db.task.count({ where: { tenantId, completedAt: { gte: ago30d } } }),
        ]);

        // Top controls with most open tasks (via controlId)
        const topControlsRaw = await db.task.groupBy({
            by: ['controlId'],
            where: { tenantId, controlId: { not: null }, status: openFilter },
            _count: true,
            orderBy: { _count: { controlId: 'desc' } },
            take: 5,
        });
        const controlIds = topControlsRaw.map(r => r.controlId).filter(Boolean) as string[];
        const controls = controlIds.length > 0
            ? await db.control.findMany({ where: { id: { in: controlIds } }, select: { id: true, code: true, name: true } })
            : [];
        const controlMap = new Map(controls.map(c => [c.id, c]));
        const topControls = topControlsRaw.map(r => ({
            controlId: r.controlId!,
            code: controlMap.get(r.controlId!)?.code || '',
            name: controlMap.get(r.controlId!)?.name || '',
            openTaskCount: r._count,
        }));

        // Top linked entities (ASSET / RISK) with most open tasks
        const topLinkedRaw = await db.taskLink.findMany({
            where: {
                tenantId,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                entityType: { in: ['ASSET', 'RISK'] as any[] },
                task: { status: openFilter },
            },
            select: { entityType: true, entityId: true },
        });
        const entityCounts = new Map<string, { entityType: string; entityId: string; count: number }>();
        for (const l of topLinkedRaw) {
            const key = `${l.entityType}:${l.entityId}`;
            const existing = entityCounts.get(key);
            if (existing) existing.count++;
            else entityCounts.set(key, { entityType: l.entityType, entityId: l.entityId, count: 1 });
        }
        const topLinkedEntities = Array.from(entityCounts.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        return {
            total,
            byStatus: Object.fromEntries(byStatus.map(r => [r.status, r._count])),
            bySeverity: Object.fromEntries(bySeverity.map(r => [r.severity, r._count])),
            byType: Object.fromEntries(byType.map(r => [r.type, r._count])),
            overdue: overdueCount,
            dueIn7d: due7dCount,
            dueIn30d: due30dCount,
            trend: { created30d: recentCreated, resolved30d: recentResolved },
            topControls,
            topLinkedEntities,
        };
    }

    // ─── Bulk ───

    static async bulkAssign(db: PrismaTx, ctx: RequestContext, taskIds: string[], assigneeUserId: string | null) {
        return db.task.updateMany({
            where: { id: { in: taskIds }, tenantId: ctx.tenantId },
            data: { assigneeUserId },
        });
    }

    static async bulkSetStatus(db: PrismaTx, ctx: RequestContext, taskIds: string[], status: string, resolution?: string | null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: any = { status: status as any };
        if (['RESOLVED', 'CLOSED', 'CANCELED'].includes(status)) {
            updateData.completedAt = new Date();
            if (resolution !== undefined) updateData.resolution = resolution;
        }
        return db.task.updateMany({
            where: { id: { in: taskIds }, tenantId: ctx.tenantId },
            data: updateData,
        });
    }

    static async bulkSetDueDate(db: PrismaTx, ctx: RequestContext, taskIds: string[], dueAt: string | null) {
        return db.task.updateMany({
            where: { id: { in: taskIds }, tenantId: ctx.tenantId },
            data: { dueAt: dueAt ? new Date(dueAt) : null },
        });
    }
}

// ─── TaskLink Repository ───

export class TaskLinkRepository {
    static async listByTask(db: PrismaTx, ctx: RequestContext, taskId: string) {
        return db.taskLink.findMany({
            where: { taskId, tenantId: ctx.tenantId },
            orderBy: { createdAt: 'desc' },
        });
    }

    static async link(db: PrismaTx, ctx: RequestContext, taskId: string, entityType: string, entityId: string, relation?: string) {
        return db.taskLink.create({
            data: {
                tenantId: ctx.tenantId,
                taskId,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                entityType: entityType as any,
                entityId,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                relation: (relation as any) || 'RELATES_TO',
            },
        });
    }

    static async unlink(db: PrismaTx, ctx: RequestContext, linkId: string) {
        const link = await db.taskLink.findFirst({ where: { id: linkId, tenantId: ctx.tenantId } });
        if (!link) return null;
        await db.taskLink.delete({ where: { id: linkId } });
        return true;
    }
}

// ─── TaskComment Repository ───

export class TaskCommentRepository {
    static async listByTask(db: PrismaTx, ctx: RequestContext, taskId: string) {
        return db.taskComment.findMany({
            where: { taskId, tenantId: ctx.tenantId },
            orderBy: { createdAt: 'asc' },
            include: { createdBy: { select: { id: true, name: true, email: true } } },
        });
    }

    static async add(db: PrismaTx, ctx: RequestContext, taskId: string, body: string) {
        return db.taskComment.create({
            data: {
                tenantId: ctx.tenantId,
                taskId,
                body,
                createdByUserId: ctx.userId,
            },
            include: { createdBy: { select: { id: true, name: true, email: true } } },
        });
    }
}

// ─── TaskWatcher Repository ───

export class TaskWatcherRepository {
    static async listByTask(db: PrismaTx, ctx: RequestContext, taskId: string) {
        return db.taskWatcher.findMany({
            where: { taskId, tenantId: ctx.tenantId },
            include: { user: { select: { id: true, name: true, email: true } } },
        });
    }

    static async add(db: PrismaTx, ctx: RequestContext, taskId: string, userId: string) {
        return db.taskWatcher.create({
            data: { tenantId: ctx.tenantId, taskId, userId },
            include: { user: { select: { id: true, name: true, email: true } } },
        });
    }

    static async remove(db: PrismaTx, ctx: RequestContext, taskId: string, userId: string) {
        const watcher = await db.taskWatcher.findFirst({ where: { taskId, userId, tenantId: ctx.tenantId } });
        if (!watcher) return null;
        await db.taskWatcher.delete({ where: { id: watcher.id } });
        return true;
    }
}
