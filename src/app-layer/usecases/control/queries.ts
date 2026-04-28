import { RequestContext } from '../../types';
import { ControlRepository } from '../../repositories/ControlRepository';
import { assertCanReadControls } from '../../policies/control.policies';
import { notFound } from '@/lib/errors/types';
import { runInTenantContext } from '@/lib/db-context';
import { assertCanAdmin } from '../../policies/common';
import { withDeleted } from '@/lib/soft-delete';
import { cachedListRead } from '@/lib/cache/list-cache';

// ─── Queries ───

export async function listControls(ctx: RequestContext, filters?: {
    status?: string; applicability?: string; ownerUserId?: string; q?: string; category?: string;
}) {
    assertCanReadControls(ctx);
    return cachedListRead({
        ctx,
        entity: 'control',
        operation: 'list',
        params: filters ?? {},
        loader: () =>
            runInTenantContext(ctx, (db) =>
                ControlRepository.list(db, ctx, filters),
            ),
    });
}

export async function listControlsPaginated(ctx: RequestContext, params: {
    limit?: number; cursor?: string;
    filters?: { status?: string; applicability?: string; ownerUserId?: string; q?: string; category?: string };
}) {
    assertCanReadControls(ctx);
    return cachedListRead({
        ctx,
        entity: 'control',
        operation: 'listPaginated',
        params,
        loader: () =>
            runInTenantContext(ctx, (db) =>
                ControlRepository.listPaginated(db, ctx, params),
            ),
    });
}

export async function getControl(ctx: RequestContext, id: string) {
    assertCanReadControls(ctx);
    return runInTenantContext(ctx, async (db) => {
        const control = await ControlRepository.getById(db, ctx, id);
        if (!control) throw notFound('Control not found');
        return control;
    });
}

// ─── Activity Trail ───

export async function getControlActivity(ctx: RequestContext, controlId: string) {
    assertCanReadControls(ctx);

    return runInTenantContext(ctx, async (db) => {
        const control = await ControlRepository.getById(db, ctx, controlId);
        if (!control) throw notFound('Control not found');

        return db.auditLog.findMany({
            where: { tenantId: ctx.tenantId, entity: 'Control', entityId: controlId },
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: { user: { select: { id: true, name: true } } },
        });
    });
}

// ─── Dashboard Metrics ───

export async function getControlDashboard(ctx: RequestContext) {
    assertCanReadControls(ctx);

    return runInTenantContext(ctx, async (db) => {
        const controls = await db.control.findMany({
            where: { tenantId: ctx.tenantId },
            include: {
                owner: { select: { id: true, name: true } },
                controlTasks: { select: { id: true, status: true, dueAt: true, assigneeUserId: true } },
                _count: { select: { evidenceLinks: true, frameworkMappings: true } },
            },
        });

        const now = new Date();
        const soonThreshold = new Date(now);
        soonThreshold.setDate(soonThreshold.getDate() + 30);

        // Status distribution
        const statusDistribution: Record<string, number> = {};
        for (const c of controls) {
            statusDistribution[c.status] = (statusDistribution[c.status] || 0) + 1;
        }

        // Applicability distribution
        const applicableCount = controls.filter(c => c.applicability === 'APPLICABLE').length;
        const notApplicableCount = controls.filter(c => c.applicability === 'NOT_APPLICABLE').length;

        // Overdue tasks
        const allTasks = controls.flatMap(c => c.controlTasks);
        const overdueTasks = allTasks.filter(t => t.dueAt && new Date(t.dueAt) < now && t.status !== 'DONE');

        // Controls due soon
        const controlsDueSoon = controls.filter(c =>
            c.nextDueAt && new Date(c.nextDueAt) <= soonThreshold && c.applicability === 'APPLICABLE'
        );

        // Top owners by open tasks
        const ownerTaskMap: Record<string, { name: string; openTasks: number }> = {};
        for (const c of controls) {
            if (!c.owner) continue;
            const openCount = c.controlTasks.filter(t => t.status !== 'DONE').length;
            if (!ownerTaskMap[c.owner.id]) {
                ownerTaskMap[c.owner.id] = { name: c.owner.name || 'Unknown', openTasks: 0 };
            }
            ownerTaskMap[c.owner.id].openTasks += openCount;
        }
        const topOwners = Object.entries(ownerTaskMap)
            .sort(([, a], [, b]) => b.openTasks - a.openTasks)
            .slice(0, 5)
            .map(([id, { name, openTasks }]) => ({ id, name, openTasks }));

        // Implementation progress: % IMPLEMENTED among APPLICABLE
        const applicableControls = controls.filter(c => c.applicability === 'APPLICABLE');
        const implementedCount = applicableControls.filter(c => c.status === 'IMPLEMENTED').length;
        const implementationProgress = applicableControls.length > 0
            ? Math.round((implementedCount / applicableControls.length) * 100)
            : 0;

        return {
            totalControls: controls.length,
            statusDistribution,
            applicabilityDistribution: { applicable: applicableCount, notApplicable: notApplicableCount },
            overdueTasks: overdueTasks.length,
            controlsDueSoon: controlsDueSoon.length,
            topOwners,
            implementationProgress,
            implementedCount,
            applicableCount,
        };
    });
}

// ─── Consistency Check (admin-only) ───

export async function runConsistencyCheck(ctx: RequestContext) {
    // Epic 1 — OWNER is a superset of ADMIN per CLAUDE.md RBAC.
    if (ctx.role !== 'OWNER' && ctx.role !== 'ADMIN') {
        throw (await import('@/lib/errors/types')).forbidden('Only admins can run consistency checks');
    }

    return runInTenantContext(ctx, async (db) => {
        const controls = await db.control.findMany({
            where: { tenantId: ctx.tenantId },
            include: { controlTasks: { select: { id: true, title: true, status: true, dueAt: true } } },
        });

        const now = new Date();

        const missingCode = controls.filter(c => !c.code);

        // Check for duplicate codes
        const codeCounts: Record<string, string[]> = {};
        for (const c of controls) {
            if (c.code) {
                if (!codeCounts[c.code]) codeCounts[c.code] = [];
                codeCounts[c.code].push(c.id);
            }
        }
        const duplicateCodes = Object.entries(codeCounts)
            .filter(([, ids]) => ids.length > 1)
            .map(([code, ids]) => ({ code, controlIds: ids }));

        // Tasks past due and still open
        const overdueTasks = controls.flatMap(c =>
            c.controlTasks
                .filter(t => t.dueAt && new Date(t.dueAt) < now && (t.status === 'OPEN' || t.status === 'IN_PROGRESS'))
                .map(t => ({ controlId: c.id, controlCode: c.code, taskId: t.id, taskTitle: t.title, dueAt: t.dueAt, status: t.status }))
        );

        return {
            totalControls: controls.length,
            issues: {
                missingCode: missingCode.map(c => ({ id: c.id, name: c.name })),
                duplicateCodes,
                overdueTasks,
            },
            summary: {
                missingCodeCount: missingCode.length,
                duplicateCodeCount: duplicateCodes.length,
                overdueTaskCount: overdueTasks.length,
            },
        };
    });
}

export async function listControlsWithDeleted(ctx: RequestContext) {
    assertCanAdmin(ctx);
    return runInTenantContext(ctx, (db) =>
        db.control.findMany(withDeleted({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: 'desc' as const } }))
    );
}
