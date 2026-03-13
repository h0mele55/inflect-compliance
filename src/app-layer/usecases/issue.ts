/**
 * @deprecated Legacy Issue usecase — delegates to Task repositories (WorkItemRepository).
 * All functions are preserved for backward compatibility with old Issue API routes.
 */
import { RequestContext } from '../types';
import { WorkItemRepository, TaskLinkRepository, TaskCommentRepository, TaskWatcherRepository, TaskFilters } from '../repositories/WorkItemRepository';
import { EvidenceBundleRepository } from '../repositories/EvidenceBundleRepository';
import { assertCanReadIssues, assertCanCreateIssue, assertCanUpdateIssue, assertCanAssignIssue, assertCanResolveIssue, assertCanComment, assertCanManageLinks, assertCanManageBundles, assertCanFreeze } from '../policies/issue.policies';
import { logEvent } from '../events/audit';
import { runInTenantContext } from '@/lib/db-context';
import { notFound } from '@/lib/errors/types';

/** @deprecated Use TaskFilters */
export type IssueFilters = TaskFilters;

// ─── List / Get ───

export async function listIssues(ctx: RequestContext, filters: IssueFilters = {}) {
    assertCanReadIssues(ctx);
    return runInTenantContext(ctx, (db) => WorkItemRepository.list(db, ctx, filters));
}

export async function getIssue(ctx: RequestContext, issueId: string) {
    assertCanReadIssues(ctx);
    return runInTenantContext(ctx, async (db) => {
        const issue = await WorkItemRepository.getById(db, ctx, issueId);
        if (!issue) throw notFound('Issue not found');
        return issue;
    });
}

// ─── Create ───

export async function createIssue(ctx: RequestContext, input: {
    title: string;
    type: string;
    description?: string | null;
    severity?: string;
    priority?: string;
    dueAt?: string | null;
    assigneeUserId?: string | null;
    reporterUserId?: string | null;
}) {
    assertCanCreateIssue(ctx);
    return runInTenantContext(ctx, async (db) => {
        const issue = await WorkItemRepository.create(db, ctx, input);
        await logEvent(db, ctx, {
            action: 'ISSUE_CREATED',
            entityType: 'Issue',
            entityId: issue.id,
            details: `Created issue: ${issue.title}`,
            metadata: { type: input.type, severity: input.severity, priority: input.priority },
        });
        return issue;
    });
}

// ─── Update ───

export async function updateIssue(ctx: RequestContext, issueId: string, patch: {
    title?: string;
    description?: string | null;
    severity?: string;
    priority?: string;
    dueAt?: string | null;
}) {
    assertCanUpdateIssue(ctx);
    return runInTenantContext(ctx, async (db) => {
        const issue = await WorkItemRepository.update(db, ctx, issueId, patch);
        if (!issue) throw notFound('Issue not found');
        await logEvent(db, ctx, {
            action: 'ISSUE_UPDATED',
            entityType: 'Issue',
            entityId: issueId,
            details: `Updated issue fields`,
            metadata: patch,
        });
        return issue;
    });
}

// ─── Status ───

export async function setIssueStatus(ctx: RequestContext, issueId: string, status: string, resolution?: string | null) {
    assertCanResolveIssue(ctx);
    return runInTenantContext(ctx, async (db) => {
        const issue = await WorkItemRepository.setStatus(db, ctx, issueId, status, resolution);
        if (!issue) throw notFound('Issue not found');
        await logEvent(db, ctx, {
            action: 'ISSUE_STATUS_CHANGED',
            entityType: 'Issue',
            entityId: issueId,
            details: `Status changed to ${status}`,
            metadata: { status, resolution },
        });
        return issue;
    });
}

// ─── Assign ───

export async function assignIssue(ctx: RequestContext, issueId: string, assigneeUserId: string | null) {
    assertCanAssignIssue(ctx);
    return runInTenantContext(ctx, async (db) => {
        const issue = await WorkItemRepository.assign(db, ctx, issueId, assigneeUserId);
        if (!issue) throw notFound('Issue not found');
        await logEvent(db, ctx, {
            action: 'ISSUE_ASSIGNED',
            entityType: 'Issue',
            entityId: issueId,
            details: assigneeUserId ? `Assigned to ${assigneeUserId}` : 'Unassigned',
            metadata: { assigneeUserId },
        });
        return issue;
    });
}

// ─── Links ───

export async function listIssueLinks(ctx: RequestContext, issueId: string) {
    assertCanReadIssues(ctx);
    return runInTenantContext(ctx, (db) => TaskLinkRepository.listByTask(db, ctx, issueId));
}

export async function addIssueLink(ctx: RequestContext, issueId: string, entityType: string, entityId: string, relation?: string) {
    assertCanManageLinks(ctx);
    return runInTenantContext(ctx, async (db) => {
        const link = await TaskLinkRepository.link(db, ctx, issueId, entityType, entityId, relation);
        await logEvent(db, ctx, {
            action: 'ISSUE_LINKED',
            entityType: 'Issue',
            entityId: issueId,
            details: `Linked to ${entityType} ${entityId}`,
            metadata: { entityType, entityId, relation },
        });
        return link;
    });
}

export async function removeIssueLink(ctx: RequestContext, linkId: string) {
    assertCanManageLinks(ctx);
    return runInTenantContext(ctx, async (db) => {
        const result = await TaskLinkRepository.unlink(db, ctx, linkId);
        if (!result) throw notFound('Issue link not found');
        await logEvent(db, ctx, {
            action: 'ISSUE_UNLINKED',
            entityType: 'Issue',
            entityId: linkId,
            details: `Removed issue link`,
        });
        return result;
    });
}

// ─── Comments ───

export async function listIssueComments(ctx: RequestContext, issueId: string) {
    assertCanReadIssues(ctx);
    return runInTenantContext(ctx, (db) => TaskCommentRepository.listByTask(db, ctx, issueId));
}

export async function addIssueComment(ctx: RequestContext, issueId: string, body: string) {
    assertCanComment(ctx);
    return runInTenantContext(ctx, async (db) => {
        const comment = await TaskCommentRepository.add(db, ctx, issueId, body);
        await logEvent(db, ctx, {
            action: 'ISSUE_COMMENT_ADDED',
            entityType: 'Issue',
            entityId: issueId,
            details: `Comment added`,
            metadata: { commentId: comment.id },
        });
        return comment;
    });
}

// ─── Watchers ───

export async function listIssueWatchers(ctx: RequestContext, issueId: string) {
    assertCanReadIssues(ctx);
    return runInTenantContext(ctx, (db) => TaskWatcherRepository.listByTask(db, ctx, issueId));
}

export async function addIssueWatcher(ctx: RequestContext, issueId: string, userId: string) {
    assertCanCreateIssue(ctx);
    return runInTenantContext(ctx, async (db) => {
        return TaskWatcherRepository.add(db, ctx, issueId, userId);
    });
}

export async function removeIssueWatcher(ctx: RequestContext, issueId: string, userId: string) {
    assertCanCreateIssue(ctx);
    return runInTenantContext(ctx, async (db) => {
        const result = await TaskWatcherRepository.remove(db, ctx, issueId, userId);
        if (!result) throw notFound('Watcher not found');
        return result;
    });
}

// ─── Metrics ───

export async function getIssueMetrics(ctx: RequestContext) {
    assertCanReadIssues(ctx);
    return runInTenantContext(ctx, (db) => WorkItemRepository.metrics(db, ctx));
}

// ─── Activity Feed ───

export async function getIssueActivity(ctx: RequestContext, issueId: string) {
    assertCanReadIssues(ctx);
    return runInTenantContext(ctx, (db) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (db as any).auditLog.findMany({
            where: { tenantId: ctx.tenantId, entity: 'Issue', entityId: issueId },
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: { user: { select: { id: true, name: true, email: true } } },
        })
    );
}

// ─── Bulk Actions ───

export async function bulkAssign(ctx: RequestContext, issueIds: string[], assigneeUserId: string | null) {
    assertCanAssignIssue(ctx);
    return runInTenantContext(ctx, async (db) => {
        const result = await WorkItemRepository.bulkAssign(db, ctx, issueIds, assigneeUserId);
        for (const id of issueIds) {
            await logEvent(db, ctx, {
                action: 'ISSUE_ASSIGNED',
                entityType: 'Issue',
                entityId: id,
                details: assigneeUserId ? `Bulk assigned to ${assigneeUserId}` : 'Bulk unassigned',
                metadata: { assigneeUserId, bulk: true },
            });
        }
        return result;
    });
}

export async function bulkSetStatus(ctx: RequestContext, issueIds: string[], status: string, resolution?: string) {
    assertCanResolveIssue(ctx);
    return runInTenantContext(ctx, async (db) => {
        const result = await WorkItemRepository.bulkSetStatus(db, ctx, issueIds, status, resolution);
        for (const id of issueIds) {
            await logEvent(db, ctx, {
                action: 'ISSUE_STATUS_CHANGED',
                entityType: 'Issue',
                entityId: id,
                details: `Bulk status changed to ${status}`,
                metadata: { status, resolution, bulk: true },
            });
        }
        return result;
    });
}

export async function bulkSetDueDate(ctx: RequestContext, issueIds: string[], dueAt: string | null) {
    assertCanUpdateIssue(ctx);
    return runInTenantContext(ctx, async (db) => {
        const result = await WorkItemRepository.bulkSetDueDate(db, ctx, issueIds, dueAt);
        for (const id of issueIds) {
            await logEvent(db, ctx, {
                action: 'ISSUE_UPDATED',
                entityType: 'Issue',
                entityId: id,
                details: `Bulk due date set to ${dueAt || 'none'}`,
                metadata: { dueAt, bulk: true },
            });
        }
        return result;
    });
}

// ─── Overdue Job Stub ───

export async function findOverdueIssuesAndEmitEvents(ctx: RequestContext) {
    assertCanReadIssues(ctx);
    return runInTenantContext(ctx, async (db) => {
        const overdueIssues = await db.task.findMany({
            where: {
                tenantId: ctx.tenantId,
                dueAt: { lt: new Date() },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                status: { notIn: ['RESOLVED', 'CLOSED'] as any },
            },
            select: { id: true, title: true, dueAt: true, assigneeUserId: true },
        });

        for (const issue of overdueIssues) {
            await logEvent(db, ctx, {
                action: 'ISSUE_OVERDUE',
                entityType: 'Issue',
                entityId: issue.id,
                details: `Issue is overdue (due ${issue.dueAt?.toISOString()})`,
                metadata: { dueAt: issue.dueAt, assigneeUserId: issue.assigneeUserId },
            });
        }

        return { processed: overdueIssues.length };
    });
}

// ─── Control Gap Linking ───

export async function listIssuesByControl(ctx: RequestContext, controlId: string) {
    assertCanReadIssues(ctx);
    return runInTenantContext(ctx, async (db) => {
        const links = await db.taskLink.findMany({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            where: { tenantId: ctx.tenantId, entityType: 'CONTROL' as any, entityId: controlId },
            include: {
                task: {
                    include: {
                        assignee: { select: { id: true, name: true, email: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return links.map((l: any) => l.task);
    });
}

// ─── Evidence Bundles (deprecated stubs) ───

export async function listBundles(ctx: RequestContext, issueId: string) {
    assertCanReadIssues(ctx);
    return runInTenantContext(ctx, (db) => EvidenceBundleRepository.listByIssue(db, ctx, issueId));
}

export async function getBundle(ctx: RequestContext, bundleId: string) {
    assertCanReadIssues(ctx);
    return runInTenantContext(ctx, (db) => EvidenceBundleRepository.getById(db, ctx, bundleId));
}

export async function createBundle(ctx: RequestContext, issueId: string, name: string) {
    assertCanManageBundles(ctx);
    return runInTenantContext(ctx, async (db) => {
        const bundle = await EvidenceBundleRepository.create(db, ctx, issueId, name);
        await logEvent(db, ctx, {
            action: 'BUNDLE_CREATED',
            entityType: 'Issue',
            entityId: issueId,
            details: `Evidence bundle "${name}" created`,
            metadata: { bundleId: bundle.id, name },
        });
        return bundle;
    });
}

export async function freezeBundle(ctx: RequestContext, bundleId: string) {
    assertCanFreeze(ctx);
    return runInTenantContext(ctx, async (db) => {
        const bundle = await EvidenceBundleRepository.freeze(db, ctx, bundleId);
        if (!bundle) throw notFound('Bundle not found');
        await logEvent(db, ctx, {
            action: 'BUNDLE_FROZEN',
            entityType: 'Issue',
            entityId: bundle.issueId,
            details: `Evidence bundle "${bundle.name}" frozen — now immutable`,
            metadata: { bundleId: bundle.id },
        });
        return bundle;
    });
}

export async function addBundleItem(ctx: RequestContext, bundleId: string, data: { entityType: string; entityId: string; label?: string }) {
    assertCanManageBundles(ctx);
    return runInTenantContext(ctx, async (db) => {
        const item = await EvidenceBundleRepository.addItem(db, ctx, bundleId, data);
        if (!item) throw notFound('Bundle not found');
        return item;
    });
}

export async function listBundleItems(ctx: RequestContext, bundleId: string) {
    assertCanReadIssues(ctx);
    return runInTenantContext(ctx, (db) => EvidenceBundleRepository.listItems(db, ctx, bundleId));
}
