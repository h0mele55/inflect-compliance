import { RequestContext } from '../types';
import { ControlRepository } from '../repositories/ControlRepository';
import { ControlTemplateRepository } from '../repositories/ControlTemplateRepository';
import { FrameworkRepository } from '../repositories/FrameworkRepository';
import {
    assertCanReadControls, assertCanCreateControl, assertCanUpdateControl,
    assertCanManageTasks, assertCanLinkEvidence, assertCanSetApplicability,
    assertCanMapFramework,
} from '../policies/control.policies';
import { logEvent } from '../events/audit';
import { notFound, forbidden, badRequest } from '@/lib/errors/types';
import { runInTenantContext } from '@/lib/db-context';
import { computeNextDueAt } from '../utils/cadence';

// ─── Queries ───

export async function listControls(ctx: RequestContext, filters?: {
    status?: string; applicability?: string; ownerUserId?: string; q?: string; category?: string;
}) {
    assertCanReadControls(ctx);
    return runInTenantContext(ctx, (db) =>
        ControlRepository.list(db, ctx, filters)
    );
}

export async function listControlsPaginated(ctx: RequestContext, params: {
    limit?: number; cursor?: string;
    filters?: { status?: string; applicability?: string; ownerUserId?: string; q?: string; category?: string };
}) {
    assertCanReadControls(ctx);
    return runInTenantContext(ctx, (db) =>
        ControlRepository.listPaginated(db, ctx, params)
    );
}

export async function getControl(ctx: RequestContext, id: string) {
    assertCanReadControls(ctx);
    return runInTenantContext(ctx, async (db) => {
        const control = await ControlRepository.getById(db, ctx, id);
        if (!control) throw notFound('Control not found');
        return control;
    });
}

// ─── Create / Update ───

export async function createControl(ctx: RequestContext, data: {
    code?: string | null;
    name: string;
    description?: string | null;
    category?: string | null;
    status?: string;
    frequency?: string | null;
    ownerUserId?: string | null;
    evidenceSource?: string | null;
    automationKey?: string | null;
    annexId?: string | null;
    intent?: string | null;
    isCustom?: boolean;
}) {
    assertCanCreateControl(ctx);

    return runInTenantContext(ctx, async (db) => {
        const control = await ControlRepository.create(db, ctx, {
            code: data.code || null,
            annexId: data.annexId || null,
            name: data.name,
            description: data.description || null,
            intent: data.intent || null,
            category: data.category || null,
            status: (data.status as 'NOT_STARTED') || 'NOT_STARTED',
            frequency: (data.frequency as 'MONTHLY') || null,
            ownerUserId: data.ownerUserId || null,
            createdByUserId: ctx.userId,
            evidenceSource: (data.evidenceSource as 'MANUAL') || null,
            automationKey: data.automationKey || null,
            isCustom: data.isCustom ?? true,
        });

        await logEvent(db, ctx, {
            action: 'CONTROL_CREATED',
            entityType: 'Control',
            entityId: control.id,
            details: `Created control: ${control.code || control.name}`,
            detailsJson: { category: 'entity_lifecycle', entityName: 'Control', operation: 'created', after: { code: control.code, name: control.name }, summary: `Created control: ${control.code || control.name}` },
        });

        return control;
    });
}

export async function updateControl(ctx: RequestContext, id: string, data: {
    name?: string;
    description?: string | null;
    category?: string | null;
    code?: string | null;
    frequency?: string | null;
    evidenceSource?: string | null;
    automationKey?: string | null;
    intent?: string | null;
}) {
    assertCanUpdateControl(ctx);

    return runInTenantContext(ctx, async (db) => {
        const control = await ControlRepository.update(db, ctx, id, {
            ...(data.name !== undefined && { name: data.name }),
            ...(data.description !== undefined && { description: data.description }),
            ...(data.category !== undefined && { category: data.category }),
            ...(data.code !== undefined && { code: data.code }),
            ...(data.frequency !== undefined && { frequency: data.frequency as 'MONTHLY' | null }),
            ...(data.evidenceSource !== undefined && { evidenceSource: data.evidenceSource as 'MANUAL' | null }),
            ...(data.automationKey !== undefined && { automationKey: data.automationKey }),
            ...(data.intent !== undefined && { intent: data.intent }),
        });

        if (!control) {
            const existingAny = await ControlRepository.getById(db, ctx, id);
            if (existingAny) throw forbidden('Cannot modify global library controls');
            throw notFound('Control not found');
        }

        await logEvent(db, ctx, {
            action: 'CONTROL_UPDATED',
            entityType: 'Control',
            entityId: id,
            details: JSON.stringify(data),
            detailsJson: { category: 'entity_lifecycle', entityName: 'Control', operation: 'updated', changedFields: Object.keys(data).filter(k => data[k as keyof typeof data] !== undefined), summary: 'Control updated' },
        });

        return control;
    });
}

// ─── Status ───

export async function setControlStatus(ctx: RequestContext, id: string, status: string) {
    assertCanUpdateControl(ctx);
    return runInTenantContext(ctx, async (db) => {
        const existing = await ControlRepository.getById(db, ctx, id);
        if (!existing) throw notFound('Control not found');
        if (!existing.tenantId) throw forbidden('Cannot change status of global library controls');

        const oldStatus = existing.status;
        const control = await ControlRepository.update(db, ctx, id, { status: status as 'NOT_STARTED' });
        if (!control) throw notFound('Control not found');

        await logEvent(db, ctx, {
            action: 'CONTROL_STATUS_CHANGED',
            entityType: 'Control',
            entityId: id,
            details: `Status changed: ${oldStatus} → ${status}`,
            detailsJson: { category: 'status_change', entityName: 'Control', fromStatus: oldStatus, toStatus: status },
        });
        return control;
    });
}

// ─── Applicability ───

export async function setControlApplicability(
    ctx: RequestContext,
    controlId: string,
    applicability: 'APPLICABLE' | 'NOT_APPLICABLE',
    justification: string | null
) {
    assertCanSetApplicability(ctx);

    if (applicability === 'NOT_APPLICABLE' && !justification) {
        throw badRequest('Justification is required when marking a control as NOT_APPLICABLE');
    }

    return runInTenantContext(ctx, async (db) => {
        const existing = await ControlRepository.getById(db, ctx, controlId);
        if (!existing) throw notFound('Control not found');
        if (!existing.tenantId) throw forbidden('Cannot change applicability of global library controls');

        const oldApplicability = existing.applicability;
        const updated = await ControlRepository.setApplicability(db, ctx, controlId, applicability, justification);
        if (!updated) throw notFound('Control not found');

        await logEvent(db, ctx, {
            action: 'CONTROL_APPLICABILITY_CHANGED',
            entityType: 'Control',
            entityId: controlId,
            details: `Applicability changed: ${oldApplicability} → ${applicability}`,
            detailsJson: { category: 'status_change', entityName: 'Control', fromStatus: oldApplicability || 'APPLICABLE', toStatus: applicability, reason: justification || undefined },
            metadata: { oldApplicability, newApplicability: applicability, justification },
        });

        return updated;
    });
}

// ─── Owner ───

export async function setControlOwner(ctx: RequestContext, id: string, ownerUserId: string | null) {
    assertCanUpdateControl(ctx);
    return runInTenantContext(ctx, async (db) => {
        // Validate the user exists before updating
        if (ownerUserId) {
            const userExists = await db.$queryRawUnsafe<Array<{ id: string }>>(
                `SELECT id FROM "User" WHERE id = $1 LIMIT 1`, ownerUserId
            );
            if (!userExists || userExists.length === 0) {
                throw badRequest(`User "${ownerUserId}" not found. Please enter a valid user ID.`);
            }
        }
        const control = await ControlRepository.setOwner(db, ctx, id, ownerUserId);
        if (!control) throw notFound('Control not found');

        await logEvent(db, ctx, {
            action: 'CONTROL_OWNER_CHANGED',
            entityType: 'Control',
            entityId: id,
            details: `Owner set to: ${ownerUserId || 'none'}`,
            detailsJson: { category: 'entity_lifecycle', entityName: 'Control', operation: 'updated', changedFields: ['ownerUserId'], after: { ownerUserId }, summary: `Owner set to: ${ownerUserId || 'none'}` },
        });
        return control;
    });
}

// ─── Contributors ───

export async function listContributors(ctx: RequestContext, controlId: string) {
    assertCanReadControls(ctx);
    return runInTenantContext(ctx, (db) =>
        ControlRepository.listContributors(db, ctx, controlId)
    );
}

export async function addContributor(ctx: RequestContext, controlId: string, userId: string) {
    assertCanUpdateControl(ctx);
    return runInTenantContext(ctx, async (db) => {
        const result = await ControlRepository.addContributor(db, ctx, controlId, userId);
        if (!result) throw notFound('Control not found');

        await logEvent(db, ctx, {
            action: 'CONTROL_CONTRIBUTOR_ADDED',
            entityType: 'Control',
            entityId: controlId,
            details: `Contributor added: ${userId}`,
            detailsJson: { category: 'relationship', operation: 'linked', sourceEntity: 'Control', sourceId: controlId, targetEntity: 'User', targetId: userId, relation: 'contributor' },
        });
        return result;
    });
}

export async function removeContributor(ctx: RequestContext, controlId: string, userId: string) {
    assertCanUpdateControl(ctx);
    return runInTenantContext(ctx, async (db) => {
        const result = await ControlRepository.removeContributor(db, ctx, controlId, userId);
        if (!result) throw notFound('Control or contributor not found');

        await logEvent(db, ctx, {
            action: 'CONTROL_CONTRIBUTOR_REMOVED',
            entityType: 'Control',
            entityId: controlId,
            details: `Contributor removed: ${userId}`,
            detailsJson: { category: 'relationship', operation: 'unlinked', sourceEntity: 'Control', sourceId: controlId, targetEntity: 'User', targetId: userId, relation: 'contributor' },
        });
        return { success: true };
    });
}

// ─── Tasks ───

export async function listControlTasks(ctx: RequestContext, controlId: string) {
    assertCanReadControls(ctx);
    return runInTenantContext(ctx, (db) =>
        ControlRepository.listTasks(db, ctx, controlId)
    );
}

export async function createControlTask(ctx: RequestContext, controlId: string, data: { title: string; description?: string | null; assigneeUserId?: string | null; dueAt?: string | null }) {
    assertCanManageTasks(ctx);
    return runInTenantContext(ctx, async (db) => {
        const task = await ControlRepository.createTask(db, ctx, controlId, data);
        if (!task) throw notFound('Control not found');

        await logEvent(db, ctx, {
            action: 'CONTROL_TASK_CREATED',
            entityType: 'Control',
            entityId: controlId,
            details: `Task created: ${data.title}`,
            detailsJson: { category: 'entity_lifecycle', entityName: 'ControlTask', operation: 'created', after: { title: data.title, controlId }, summary: `Task created: ${data.title}` },
        });
        return task;
    });
}

export async function updateControlTask(ctx: RequestContext, taskId: string, data: { title?: string; description?: string | null; status?: string; assigneeUserId?: string | null; dueAt?: string | null }) {
    assertCanManageTasks(ctx);
    return runInTenantContext(ctx, async (db) => {
        const task = await ControlRepository.updateTask(db, ctx, taskId, data);
        if (!task) throw notFound('Task not found');

        const action = data.status === 'DONE' ? 'CONTROL_TASK_COMPLETED' : 'CONTROL_TASK_UPDATED';
        await logEvent(db, ctx, {
            action,
            entityType: 'Control',
            entityId: task.controlId,
            details: `Task ${action === 'CONTROL_TASK_COMPLETED' ? 'completed' : 'updated'}: ${task.title}`,
            detailsJson: data.status ? { category: 'status_change', entityName: 'ControlTask', fromStatus: null, toStatus: data.status } : { category: 'entity_lifecycle', entityName: 'ControlTask', operation: 'updated', changedFields: Object.keys(data), summary: `Task updated: ${task.title}` },
        });
        return task;
    });
}

export async function deleteControlTask(ctx: RequestContext, taskId: string) {
    assertCanManageTasks(ctx);
    return runInTenantContext(ctx, async (db) => {
        const result = await ControlRepository.deleteTask(db, ctx, taskId);
        if (!result) throw notFound('Task not found');
        return { success: true };
    });
}

// ─── Evidence Links ───

export async function listEvidenceLinks(ctx: RequestContext, controlId: string) {
    assertCanReadControls(ctx);
    return runInTenantContext(ctx, (db) =>
        ControlRepository.listEvidenceLinks(db, ctx, controlId)
    );
}

export async function linkEvidence(ctx: RequestContext, controlId: string, data: { kind: string; fileId?: string | null; url?: string | null; note?: string | null }) {
    assertCanLinkEvidence(ctx);
    return runInTenantContext(ctx, async (db) => {
        const link = await ControlRepository.linkEvidence(db, ctx, controlId, data);
        if (!link) throw notFound('Control not found');

        await logEvent(db, ctx, {
            action: 'CONTROL_EVIDENCE_LINKED',
            entityType: 'Control',
            entityId: controlId,
            details: `Evidence linked: ${data.kind}${data.url ? ` (${data.url})` : ''}`,
            detailsJson: { category: 'relationship', operation: 'linked', sourceEntity: 'Control', sourceId: controlId, targetEntity: 'Evidence', targetId: data.fileId || 'url', relation: data.kind },
        });
        return link;
    });
}

export async function unlinkEvidence(ctx: RequestContext, controlId: string, linkId: string) {
    assertCanLinkEvidence(ctx);
    return runInTenantContext(ctx, async (db) => {
        const result = await ControlRepository.unlinkEvidence(db, ctx, controlId, linkId);
        if (!result) throw notFound('Evidence link not found');

        await logEvent(db, ctx, {
            action: 'CONTROL_EVIDENCE_UNLINKED',
            entityType: 'Control',
            entityId: controlId,
            details: `Evidence link removed: ${linkId}`,
            detailsJson: { category: 'relationship', operation: 'unlinked', sourceEntity: 'Control', sourceId: controlId, targetEntity: 'EvidenceLink', targetId: linkId },
        });
        return { success: true };
    });
}

// ─── Asset Linking (existing) ───

export async function linkAssetToControl(ctx: RequestContext, controlId: string, assetId: string) {
    assertCanUpdateControl(ctx);
    return runInTenantContext(ctx, async (db) => {
        const link = await ControlRepository.linkAsset(db, ctx, controlId, assetId);
        if (!link) throw notFound('Control not found');
        return link;
    });
}

export async function unlinkAssetFromControl(ctx: RequestContext, controlId: string, assetId: string) {
    assertCanUpdateControl(ctx);
    return runInTenantContext(ctx, async (db) => {
        const result = await ControlRepository.unlinkAsset(db, ctx, controlId, assetId);
        if (!result) throw notFound('Control or asset link not found');
        return { success: true };
    });
}

// ─── Templates ───

export async function listControlTemplates(ctx: RequestContext) {
    assertCanReadControls(ctx);
    return runInTenantContext(ctx, (db) =>
        ControlTemplateRepository.list(db)
    );
}

export async function installControlsFromTemplate(ctx: RequestContext, templateIds: string[]) {
    assertCanCreateControl(ctx);

    return runInTenantContext(ctx, async (db) => {
        const results: Array<{ templateCode: string; controlId: string; tasksCreated: number; requirementsLinked: number }> = [];

        for (const templateId of templateIds) {
            const template = await ControlTemplateRepository.getById(db, templateId);
            if (!template) continue;

            // Check if control with this code already exists for tenant
            const existing = await db.control.findFirst({
                where: { tenantId: ctx.tenantId, code: template.code },
            });
            if (existing) {
                // Skip — idempotent, don't create duplicates
                results.push({
                    templateCode: template.code,
                    controlId: existing.id,
                    tasksCreated: 0,
                    requirementsLinked: 0,
                });
                continue;
            }

            // Create control from template
            const control = await db.control.create({
                data: {
                    tenantId: ctx.tenantId,
                    code: template.code,
                    name: template.title,
                    description: template.description,
                    category: template.category,
                    frequency: template.defaultFrequency,
                    status: 'NOT_STARTED',
                    isCustom: false,
                    createdByUserId: ctx.userId,
                },
            });

            // Create tasks from template
            let tasksCreated = 0;
            for (const tplTask of template.tasks) {
                await db.controlTask.create({
                    data: {
                        tenantId: ctx.tenantId,
                        controlId: control.id,
                        title: tplTask.title,
                        description: tplTask.description,
                    },
                });
                tasksCreated++;
            }

            // Create framework mapping links
            let requirementsLinked = 0;
            for (const rl of template.requirementLinks) {
                await db.frameworkMapping.create({
                    data: {
                        fromRequirementId: rl.requirementId,
                        toControlId: control.id,
                    },
                });
                requirementsLinked++;
            }

            await logEvent(db, ctx, {
                action: 'CONTROL_INSTALLED_FROM_TEMPLATE',
                entityType: 'Control',
                entityId: control.id,
                details: `Installed control from template: ${template.code} — ${template.title}`,
                detailsJson: { category: 'entity_lifecycle', entityName: 'Control', operation: 'created', after: { code: template.code, name: template.title, templateId, tasksCreated, requirementsLinked }, summary: `Installed from template: ${template.code}` },
                metadata: { templateId, tasksCreated, requirementsLinked },
            });

            results.push({
                templateCode: template.code,
                controlId: control.id,
                tasksCreated,
                requirementsLinked,
            });
        }

        return results;
    });
}

// ─── Frameworks (read-only) ───

export async function listFrameworks(ctx: RequestContext) {
    assertCanReadControls(ctx);
    return runInTenantContext(ctx, (db) =>
        FrameworkRepository.listFrameworks(db)
    );
}

export async function listFrameworkRequirements(ctx: RequestContext, frameworkKey: string) {
    assertCanReadControls(ctx);
    return runInTenantContext(ctx, async (db) => {
        const result = await FrameworkRepository.listRequirements(db, frameworkKey);
        if (result === null) throw notFound('Framework not found');
        return result;
    });
}

// ─── Requirement Mapping ───

export async function mapRequirementToControl(ctx: RequestContext, controlId: string, requirementId: string) {
    assertCanMapFramework(ctx);
    return runInTenantContext(ctx, async (db) => {
        const control = await db.control.findFirst({ where: { id: controlId, tenantId: ctx.tenantId } });
        if (!control) throw notFound('Control not found');

        const mapping = await db.frameworkMapping.create({
            data: { fromRequirementId: requirementId, toControlId: controlId },
            include: { fromRequirement: { include: { framework: { select: { name: true } } } } },
        });
        return mapping;
    });
}

export async function unmapRequirementFromControl(ctx: RequestContext, controlId: string, requirementId: string) {
    assertCanMapFramework(ctx);
    return runInTenantContext(ctx, async (db) => {
        const control = await db.control.findFirst({ where: { id: controlId, tenantId: ctx.tenantId } });
        if (!control) throw notFound('Control not found');

        const mapping = await db.frameworkMapping.findFirst({
            where: { fromRequirementId: requirementId, toControlId: controlId },
        });
        if (!mapping) throw notFound('Mapping not found');

        await db.frameworkMapping.delete({ where: { id: mapping.id } });
        return { success: true };
    });
}

// ─── Cadence: Mark Test Completed ───

export async function markControlTestCompleted(ctx: RequestContext, controlId: string) {
    assertCanUpdateControl(ctx);

    return runInTenantContext(ctx, async (db) => {
        const existing = await ControlRepository.getById(db, ctx, controlId);
        if (!existing) throw notFound('Control not found');
        if (!existing.tenantId) throw forbidden('Cannot modify global library controls');
        if (existing.applicability === 'NOT_APPLICABLE') {
            throw badRequest('Cannot mark test completed for NOT_APPLICABLE controls');
        }

        const now = new Date();
        const nextDue = computeNextDueAt(existing.frequency, now);

        const updated = await ControlRepository.update(db, ctx, controlId, {
            lastTested: now,
            nextDueAt: nextDue,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        await logEvent(db, ctx, {
            action: 'CONTROL_TEST_COMPLETED',
            entityType: 'Control',
            entityId: controlId,
            details: `Test completed. Next due: ${nextDue ? nextDue.toISOString().slice(0, 10) : 'N/A (ad hoc)'}`,
            detailsJson: { category: 'custom', event: 'test_completed', lastTested: now.toISOString(), nextDueAt: nextDue?.toISOString() ?? null },
            metadata: { lastTested: now.toISOString(), nextDueAt: nextDue?.toISOString() ?? null },
        });

        return updated;
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

// ─── Consistency Check (admin-only) ───

export async function runConsistencyCheck(ctx: RequestContext) {
    if (ctx.role !== 'ADMIN') throw forbidden('Only admins can run consistency checks');

    return runInTenantContext(ctx, async (db) => {
        const controls = await db.control.findMany({
            where: { tenantId: ctx.tenantId },
            include: { controlTasks: { select: { id: true, title: true, status: true, dueAt: true } } },
        });

        const now = new Date();

        const missingCodeOrTitle = controls.filter(c => !c.code && !c.name);
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

// ─── Soft Delete / Restore / Purge ───

import { restoreEntity, purgeEntity } from './soft-delete-operations';
import { withDeleted } from '@/lib/soft-delete';
import { assertCanAdmin } from '../policies/common';

export async function deleteControl(ctx: RequestContext, id: string) {
    assertCanAdmin(ctx);
    return runInTenantContext(ctx, async (db) => {
        const control = await ControlRepository.getById(db, ctx, id);
        if (!control) throw notFound('Control not found');
        if (!control.tenantId) throw forbidden('Cannot delete global library controls');

        await db.control.delete({ where: { id } });

        await logEvent(db, ctx, {
            action: 'SOFT_DELETE',
            entityType: 'Control',
            entityId: id,
            details: `Control soft-deleted: ${control.code || control.name}`,
            detailsJson: { category: 'entity_lifecycle', entityName: 'Control', operation: 'deleted', summary: `Control soft-deleted: ${control.code || control.name}` },
        });
        return { success: true };
    });
}

export async function restoreControl(ctx: RequestContext, id: string) {
    return restoreEntity(ctx, 'Control', id);
}

export async function purgeControl(ctx: RequestContext, id: string) {
    return purgeEntity(ctx, 'Control', id);
}

export async function listControlsWithDeleted(ctx: RequestContext) {
    assertCanAdmin(ctx);
    return runInTenantContext(ctx, (db) =>
        db.control.findMany(withDeleted({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: 'desc' as const } }))
    );
}
