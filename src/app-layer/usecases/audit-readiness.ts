/**
 * Audit Readiness Usecases
 * Core business logic for audit cycles, packs, freeze, share, and default pack templates.
 */
import { RequestContext } from '../types';
import {
    assertCanManageAuditCycles, assertCanManageAuditPacks,
    assertCanFreezePack, assertCanSharePack, assertCanViewPack,
    assertCanManageAuditors,
} from '../policies/audit-readiness.policies';
import { logEvent } from '../events/audit';
import { runInTenantContext, runInGlobalContext } from '@/lib/db-context';
import { notFound, badRequest, forbidden } from '@/lib/errors/types';
import { TERMINAL_WORK_ITEM_STATUSES } from '../domain/work-item-status';

import crypto from 'crypto';

// в”Ђв”Ђв”Ђ Token Hashing в”Ђв”Ђв”Ђ

export function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateShareToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

// в”Ђв”Ђв”Ђ Audit Cycles в”Ђв”Ђв”Ђ

export async function createAuditCycle(
    ctx: RequestContext,
    data: { frameworkKey: string; frameworkVersion: string; name: string; periodStartAt?: string; periodEndAt?: string }
) {
    assertCanManageAuditCycles(ctx);
    if (!['ISO27001', 'NIS2'].includes(data.frameworkKey)) {
        throw badRequest('frameworkKey must be ISO27001 or NIS2');
    }

    return runInTenantContext(ctx, async (tdb) => {
        const cycle = await tdb.auditCycle.create({
            data: {
                tenantId: ctx.tenantId,
                frameworkKey: data.frameworkKey,
                frameworkVersion: data.frameworkVersion,
                name: data.name,
                periodStartAt: data.periodStartAt ? new Date(data.periodStartAt) : null,
                periodEndAt: data.periodEndAt ? new Date(data.periodEndAt) : null,
                createdByUserId: ctx.userId,
            },
        });
        await logEvent(tdb, ctx, { action: 'AUDIT_CYCLE_CREATED', entityType: 'AuditCycle', entityId: cycle.id, details: JSON.stringify({ frameworkKey: data.frameworkKey, name: data.name }), detailsJson: { category: 'entity_lifecycle', entityName: 'AuditCycle', operation: 'created', after: { frameworkKey: data.frameworkKey, name: data.name }, summary: `Audit cycle created: ${data.name}` } });
        return cycle;
    });
}

export async function listAuditCycles(ctx: RequestContext) {
    assertCanViewPack(ctx);
    return runInTenantContext(ctx, (tdb) =>
        tdb.auditCycle.findMany({
            where: { tenantId: ctx.tenantId },
            include: { packs: { select: { id: true, name: true, status: true } } },
            orderBy: { createdAt: 'desc' },
        })
    );
}

export async function getAuditCycle(ctx: RequestContext, cycleId: string) {
    assertCanViewPack(ctx);
    const cycle = await runInTenantContext(ctx, (tdb) =>
        tdb.auditCycle.findFirst({
            where: { id: cycleId, tenantId: ctx.tenantId },
            include: { packs: true, createdBy: { select: { id: true, name: true, email: true } } },
        })
    );
    if (!cycle) throw notFound('Audit cycle not found');
    return cycle;
}

export async function updateAuditCycle(
    ctx: RequestContext,
    cycleId: string,
    data: { name?: string; status?: string; periodStartAt?: string; periodEndAt?: string }
) {
    assertCanManageAuditCycles(ctx);
    return runInTenantContext(ctx, async (tdb) => {
        const existing = await tdb.auditCycle.findFirst({ where: { id: cycleId, tenantId: ctx.tenantId } });
        if (!existing) throw notFound('Audit cycle not found');
        const cycle = await tdb.auditCycle.update({
            where: { id: cycleId },
            data: {
                ...(data.name !== undefined && { name: data.name }),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...(data.status !== undefined && { status: data.status as any }),
                ...(data.periodStartAt !== undefined && { periodStartAt: data.periodStartAt ? new Date(data.periodStartAt) : null }),
                ...(data.periodEndAt !== undefined && { periodEndAt: data.periodEndAt ? new Date(data.periodEndAt) : null }),
            },
        });
        await logEvent(tdb, ctx, { action: 'AUDIT_CYCLE_UPDATED', entityType: 'AuditCycle', entityId: cycle.id, details: JSON.stringify(data), detailsJson: { category: 'entity_lifecycle', entityName: 'AuditCycle', operation: 'updated', changedFields: Object.keys(data).filter(k => data[k as keyof typeof data] !== undefined), summary: 'Audit cycle updated' } });
        return cycle;
    });
}

// в”Ђв”Ђв”Ђ Audit Packs в”Ђв”Ђв”Ђ

export async function createAuditPack(ctx: RequestContext, auditCycleId: string, name: string) {
    assertCanManageAuditPacks(ctx);
    return runInTenantContext(ctx, async (tdb) => {
        const cycle = await tdb.auditCycle.findFirst({ where: { id: auditCycleId, tenantId: ctx.tenantId } });
        if (!cycle) throw notFound('Audit cycle not found');
        const pack = await tdb.auditPack.create({
            data: { tenantId: ctx.tenantId, auditCycleId, name },
        });
        await logEvent(tdb, ctx, { action: 'AUDIT_PACK_CREATED', entityType: 'AuditPack', entityId: pack.id, details: JSON.stringify({ auditCycleId, name }), detailsJson: { category: 'entity_lifecycle', entityName: 'AuditPack', operation: 'created', after: { auditCycleId, name }, summary: `Audit pack created: ${name}` } });
        return pack;
    });
}

export async function listAuditPacks(ctx: RequestContext, cycleId?: string) {
    assertCanViewPack(ctx);
    return runInTenantContext(ctx, (tdb) =>
        tdb.auditPack.findMany({
            where: { tenantId: ctx.tenantId, ...(cycleId ? { auditCycleId: cycleId } : {}) },
            include: { _count: { select: { items: true } }, cycle: { select: { frameworkKey: true, name: true } } },
            orderBy: { createdAt: 'desc' },
        })
    );
}

export async function getAuditPack(ctx: RequestContext, packId: string) {
    assertCanViewPack(ctx);
    const pack = await runInTenantContext(ctx, (tdb) =>
        tdb.auditPack.findFirst({
            where: { id: packId, tenantId: ctx.tenantId },
            include: {
                items: { orderBy: { sortOrder: 'asc' } },
                cycle: true,
                frozenBy: { select: { id: true, name: true, email: true } },
                _count: { select: { items: true, shares: true } },
            },
        })
    );
    if (!pack) throw notFound('Audit pack not found');
    return pack;
}

export async function updateAuditPack(ctx: RequestContext, packId: string, data: { name?: string; notes?: string }) {
    assertCanManageAuditPacks(ctx);
    return runInTenantContext(ctx, async (tdb) => {
        const existing = await tdb.auditPack.findFirst({ where: { id: packId, tenantId: ctx.tenantId } });
        if (!existing) throw notFound('Audit pack not found');
        if (existing.status !== 'DRAFT') throw badRequest('Cannot update a frozen or exported pack');
        return tdb.auditPack.update({
            where: { id: packId },
            data: { ...(data.name !== undefined && { name: data.name }), ...(data.notes !== undefined && { notes: data.notes }) },
        });
    });
}

// в”Ђв”Ђв”Ђ Pack Items в”Ђв”Ђв”Ђ

export async function addAuditPackItems(
    ctx: RequestContext,
    packId: string,
    items: Array<{ entityType: string; entityId: string; snapshotJson?: string; sortOrder?: number }>
) {
    assertCanManageAuditPacks(ctx);
    return runInTenantContext(ctx, async (tdb) => {
        const pack = await tdb.auditPack.findFirst({ where: { id: packId, tenantId: ctx.tenantId } });
        if (!pack) throw notFound('Audit pack not found');
        if (pack.status !== 'DRAFT') throw badRequest('Cannot add items to a frozen or exported pack');
        if (!items || items.length === 0) throw badRequest('At least one item required');

        const payload = items.map(item => ({
            tenantId: ctx.tenantId,
            auditPackId: packId,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            entityType: item.entityType as any,
            entityId: item.entityId,
            snapshotJson: item.snapshotJson || '{}',
            sortOrder: item.sortOrder ?? 0,
        }));

        const result = await tdb.auditPackItem.createMany({
            data: payload,
            skipDuplicates: true,
        });

        const created = result.count;
        const skipped = items.length - created;

        await logEvent(tdb, ctx, { action: 'AUDIT_PACK_UPDATED', entityType: 'AuditPack', entityId: packId, details: JSON.stringify({ created, skipped }), detailsJson: { category: 'entity_lifecycle', entityName: 'AuditPack', operation: 'updated', after: { itemsCreated: created, itemsSkipped: skipped }, summary: `Audit pack items added: ${created} created, ${skipped} skipped` } });
        return { created, skipped };
    });
}

// в”Ђв”Ђв”Ђ Snapshot Creation в”Ђв”Ђв”Ђ

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createControlSnapshot(tdb: any, controlId: string, tenantId: string): Promise<string> {
    const ctrl = await tdb.control.findFirst({
        where: { id: controlId, tenantId },
        include: {
            tasks: { select: { id: true, title: true, status: true, dueDate: true } },
            evidence: { select: { id: true, title: true, status: true, type: true } },
            requirementLinks: { include: { requirement: { select: { code: true, title: true, frameworkId: true } } } },
        },
    });
    if (!ctrl) return JSON.stringify({ error: 'Control not found', entityId: controlId });
    return JSON.stringify({
        code: ctrl.code, name: ctrl.name, status: ctrl.status,
        description: ctrl.description,
        owner: ctrl.ownerId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        taskCompletion: { total: ctrl.tasks.length, done: ctrl.tasks.filter((t: any) => t.status === 'DONE').length },
        evidenceCount: ctrl.evidence.length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mappedRequirements: (ctrl.requirementLinks || []).map((l: any) => ({
            code: l.requirement.code, title: l.requirement.title,
        })),
        snapshotAt: new Date().toISOString(),
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createPolicySnapshot(tdb: any, policyId: string, tenantId: string): Promise<string> {
    const pol = await tdb.policy.findFirst({
        where: { id: policyId, tenantId },
        include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { versionNumber: true, status: true } } },
    });
    if (!pol) return JSON.stringify({ error: 'Policy not found', entityId: policyId });
    return JSON.stringify({
        title: pol.title, status: pol.status, category: pol.category,
        currentVersion: pol.versions[0]?.versionNumber,
        currentVersionStatus: pol.versions[0]?.status,
        snapshotAt: new Date().toISOString(),
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createEvidenceSnapshot(tdb: any, evidenceId: string, tenantId: string): Promise<string> {
    const ev = await tdb.evidence.findFirst({ where: { id: evidenceId, tenantId } });
    if (!ev) return JSON.stringify({ error: 'Evidence not found', entityId: evidenceId });
    return JSON.stringify({
        title: ev.title, type: ev.type, status: ev.status,
        snapshotAt: new Date().toISOString(),
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createIssueSnapshot(tdb: any, issueId: string, tenantId: string): Promise<string> {
    const issue = await tdb.task.findFirst({ where: { id: issueId, tenantId } });
    if (!issue) return JSON.stringify({ error: 'Issue not found', entityId: issueId });
    return JSON.stringify({
        title: issue.title, type: issue.type, severity: issue.severity,
        status: issue.status, dueAt: issue.dueAt,
        snapshotAt: new Date().toISOString(),
    });
}

// в”Ђв”Ђв”Ђ Freeze Pack в”Ђв”Ђв”Ђ

export async function freezeAuditPack(ctx: RequestContext, packId: string) {
    assertCanFreezePack(ctx);

    // Use an extended transaction timeout (60s) because large packs (500+ items)
    // require snapshot creation for each item, which exceeds the default 5s timeout.
    const frozenPack = await runInTenantContext(ctx, async (tdb) => {
        const pack = await tdb.auditPack.findFirst({
            where: { id: packId, tenantId: ctx.tenantId },
            include: { items: true },
        });
        if (!pack) throw notFound('Audit pack not found');
        if (pack.status !== 'DRAFT') throw badRequest('Pack is already frozen or exported');
        if (pack.items.length === 0) throw badRequest('Cannot freeze an empty pack');

        // Create snapshots for all items in chunks
        const CHUNK_SIZE = 10;
        for (let i = 0; i < pack.items.length; i += CHUNK_SIZE) {
            const chunk = pack.items.slice(i, i + CHUNK_SIZE);
            await Promise.all(chunk.map(async (item) => {
                let snapshot = item.snapshotJson;
                try {
                    if (!snapshot || snapshot === '{}') {
                        switch (item.entityType) {
                            case 'CONTROL': snapshot = await createControlSnapshot(tdb, item.entityId, ctx.tenantId); break;
                            case 'POLICY': snapshot = await createPolicySnapshot(tdb, item.entityId, ctx.tenantId); break;
                            case 'EVIDENCE': snapshot = await createEvidenceSnapshot(tdb, item.entityId, ctx.tenantId); break;
                            case 'ISSUE': snapshot = await createIssueSnapshot(tdb, item.entityId, ctx.tenantId); break;
                            default: snapshot = JSON.stringify({ entityType: item.entityType, entityId: item.entityId, snapshotAt: new Date().toISOString() });
                        }
                        await tdb.auditPackItem.update({ where: { id: item.id }, data: { snapshotJson: snapshot } });
                    }
                } catch { /* keep existing snapshot */ }
            }));
        }

        const result = await tdb.auditPack.update({
            where: { id: packId },
            data: { status: 'FROZEN', frozenAt: new Date(), frozenByUserId: ctx.userId },
        });

        await logEvent(tdb, ctx, { action: 'AUDIT_PACK_FROZEN', entityType: 'AuditPack', entityId: packId, details: JSON.stringify({ itemCount: pack.items.length }), detailsJson: { category: 'status_change', entityName: 'AuditPack', fromStatus: 'DRAFT', toStatus: 'FROZEN', reason: `Pack frozen with ${pack.items.length} items` } });

        return { frozenPack: result, itemCount: pack.items.length };
    }, { timeout: 60000, maxWait: 10000 });

    // Phase 2: Attach SoA snapshot as EXPORT_ARTIFACT (best-effort, separate transaction)
    // This runs outside the freeze transaction because getSoA opens its own
    // runInTenantContext calls, and Prisma interactive transactions cannot be nested.
    try {
        const { getSoA } = await import('./soa');
        const soaReport = await getSoA(ctx, {
            includeEvidence: true,
            includeTasks: true,
            includeTests: true,
        });
        const soaSnapshot = JSON.stringify({
            type: 'SOA_REPORT',
            framework: soaReport.framework,
            generatedAt: soaReport.generatedAt,
            summary: soaReport.summary,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            entries: soaReport.entries.map((e: any) => ({
                code: e.requirementCode,
                title: e.requirementTitle,
                section: e.section,
                applicable: e.applicable,
                justification: e.justification,
                status: e.implementationStatus,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                controlRefs: e.mappedControls.map((c: any) => `${c.code || '—'} ${c.title}`).join('; '),
                evidenceCount: e.evidenceCount,
            })),
            snapshotAt: new Date().toISOString(),
        });
        await runInTenantContext(ctx, (tdb) =>
            tdb.auditPackItem.create({
                data: {
                    tenantId: ctx.tenantId,
                    auditPackId: packId,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    entityType: 'EXPORT_ARTIFACT' as any,
                    entityId: `soa-${soaReport.framework}`,
                    snapshotJson: soaSnapshot,
                    sortOrder: frozenPack.itemCount + 1,
                },
            })
        );
    } catch { /* SoA attachment is best-effort */ }

    return frozenPack.frozenPack;
}

// в”Ђв”Ђв”Ђ Share Pack в”Ђв”Ђв”Ђ

export async function generateShareLink(ctx: RequestContext, packId: string, expiresAt?: string) {
    assertCanSharePack(ctx);
    const token = generateShareToken();
    const hash = hashToken(token);

    await runInTenantContext(ctx, async (tdb) => {
        const pack = await tdb.auditPack.findFirst({ where: { id: packId, tenantId: ctx.tenantId } });
        if (!pack) throw notFound('Audit pack not found');
        if (pack.status === 'DRAFT') throw badRequest('Cannot share a draft pack. Freeze it first.');

        await tdb.auditPackShare.create({
            data: {
                tenantId: ctx.tenantId,
                auditPackId: packId,
                tokenHash: hash,
                expiresAt: expiresAt ? new Date(expiresAt) : null,
                createdByUserId: ctx.userId,
            },
        });

        await logEvent(tdb, ctx, { action: 'AUDIT_PACK_SHARED', entityType: 'AuditPack', entityId: packId, details: JSON.stringify({ expiresAt }), detailsJson: { category: 'access', operation: 'permission_changed', detail: `Pack shared${expiresAt ? ` until ${expiresAt}` : ' (no expiry)'}` } });
    });

    return { token, expiresAt: expiresAt || null };
}

export async function revokeShare(ctx: RequestContext, shareId: string) {
    assertCanSharePack(ctx);
    return runInTenantContext(ctx, async (tdb) => {
        const share = await tdb.auditPackShare.findFirst({ where: { id: shareId, tenantId: ctx.tenantId } });
        if (!share) throw notFound('Share not found');
        if (share.revokedAt) throw badRequest('Share already revoked');
        await tdb.auditPackShare.update({ where: { id: shareId }, data: { revokedAt: new Date() } });
        await logEvent(tdb, ctx, { action: 'AUDIT_PACK_REVOKED', entityType: 'AuditPackShare', entityId: shareId, details: 'Share revoked', detailsJson: { category: 'access', operation: 'permission_changed', detail: 'Share link revoked' } });
        return { revoked: true };
    });
}

export async function getPackByShareToken(token: string) {
    const hash = hashToken(token);
    return runInGlobalContext(async (db) => {
        const share = await db.auditPackShare.findFirst({
        where: { tokenHash: hash, revokedAt: null },
        include: {
            pack: {
                include: {
                    items: { orderBy: { sortOrder: 'asc' } },
                    cycle: { select: { frameworkKey: true, frameworkVersion: true, name: true } },
                },
            },
        },
    });
    if (!share) throw notFound('Invalid or expired share link');
    if (share.expiresAt && share.expiresAt < new Date()) {
        throw forbidden('Share link has expired');
    }
        return {
            pack: share.pack,
            cycle: share.pack.cycle,
            items: share.pack.items,
        };
    });
}

// в”Ђв”Ђв”Ђ Auditor Accounts в”Ђв”Ђв”Ђ

export async function inviteAuditor(ctx: RequestContext, email: string, name?: string) {
    assertCanManageAuditors(ctx);
    return runInTenantContext(ctx, async (tdb) => {
        const auditor = await tdb.auditorAccount.upsert({
            where: { tenantId_email: { tenantId: ctx.tenantId, email } },
            create: { tenantId: ctx.tenantId, email, name, status: 'INVITED' },
            update: { name, status: 'ACTIVE' },
        });
        await logEvent(tdb, ctx, { action: 'AUDITOR_INVITED', entityType: 'AuditorAccount', entityId: auditor.id, details: JSON.stringify({ email }), detailsJson: { category: 'access', operation: 'permission_changed', targetUserId: auditor.id, detail: `Auditor invited: ${email}` } });
        return auditor;
    });
}

export async function grantAuditorAccess(ctx: RequestContext, auditorId: string, packId: string) {
    assertCanManageAuditors(ctx);
    return runInTenantContext(ctx, async (tdb) => {
        const auditor = await tdb.auditorAccount.findFirst({ where: { id: auditorId, tenantId: ctx.tenantId } });
        if (!auditor) throw notFound('Auditor not found');
        const pack = await tdb.auditPack.findFirst({ where: { id: packId, tenantId: ctx.tenantId } });
        if (!pack) throw notFound('Pack not found');

        try {
            await tdb.auditorPackAccess.create({ data: { auditorId, auditPackId: packId } });
        } catch { throw badRequest('Auditor already has access to this pack'); }

        await logEvent(tdb, ctx, { action: 'AUDITOR_GRANTED', entityType: 'AuditorPackAccess', entityId: `${auditorId}_${packId}`, details: JSON.stringify({ email: auditor.email }), detailsJson: { category: 'access', operation: 'permission_changed', targetUserId: auditorId, detail: `Auditor granted access to pack ${packId}` } });
        return { granted: true };
    });
}

export async function revokeAuditorAccess(ctx: RequestContext, auditorId: string, packId: string) {
    assertCanManageAuditors(ctx);
    return runInTenantContext(ctx, async (tdb) => {
        await tdb.auditorPackAccess.deleteMany({ where: { auditorId, auditPackId: packId } });
        await logEvent(tdb, ctx, { action: 'AUDITOR_REVOKED', entityType: 'AuditorPackAccess', entityId: `${auditorId}_${packId}`, details: 'Auditor access revoked', detailsJson: { category: 'access', operation: 'permission_changed', targetUserId: auditorId, detail: `Auditor access revoked from pack ${packId}` } });
        return { revoked: true };
    });
}

// в”Ђв”Ђв”Ђ Default Pack Templates (selection logic) в”Ђв”Ђв”Ђ

export async function previewDefaultPack(ctx: RequestContext, cycleId: string) {
    assertCanViewPack(ctx);

    const cycle = await runInTenantContext(ctx, (tdb) =>
        tdb.auditCycle.findFirst({ where: { id: cycleId, tenantId: ctx.tenantId } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any;
    if (!cycle) throw notFound('Audit cycle not found');

    if (cycle.frameworkKey === 'ISO27001') {
        return previewISO27001DefaultPack(ctx);
    } else if (cycle.frameworkKey === 'NIS2') {
        return previewNIS2DefaultPack(ctx);
    }
    throw badRequest(`No default pack template for framework: ${cycle.frameworkKey}`);
}

async function previewISO27001DefaultPack(ctx: RequestContext) {
    const fw = await runInTenantContext(ctx, (tdb) => tdb.framework.findFirst({ where: { key: 'ISO27001' } }));

    // Controls mapped to ISO27001 requirements
    let controlIds: string[] = [];
    if (fw) {
        const links = await runInTenantContext(ctx, (tdb) =>
            tdb.controlRequirementLink.findMany({
                where: { tenantId: ctx.tenantId, requirement: { frameworkId: fw.id } },
                select: { controlId: true },
            })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        controlIds = [...new Set(links.map((l: any) => l.controlId))];
    }

    // Fallback: all controls if no framework mapping
    if (controlIds.length === 0) {
        const controls = await runInTenantContext(ctx, (tdb) =>
            tdb.control.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true } })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        controlIds = controls.map((c: any) => c.id);
    }

    // Policies with category "Security" or any policies
    const policies = await runInTenantContext(ctx, (tdb) =>
        tdb.policy.findMany({
            where: { tenantId: ctx.tenantId },
            select: { id: true, category: true },
        })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const securityPolicies = policies.filter((p: any) => p.category === 'Security' || p.category === 'INFORMATION_SECURITY');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const policyIds = (securityPolicies.length > 0 ? securityPolicies : policies).map((p: any) => p.id);

    // Evidence linked to those controls (via direct Control.evidence relation)
    const controlsWithEvidence = await runInTenantContext(ctx, (tdb) =>
        tdb.control.findMany({
            where: { tenantId: ctx.tenantId, id: { in: controlIds } },
            select: { evidence: { select: { id: true } } },
        })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evidenceIds = [...new Set(controlsWithEvidence.flatMap((c: any) => c.evidence.map((e: any) => e.id)))];

    // Open issues
    const issues = await runInTenantContext(ctx, (tdb) =>
        tdb.task.findMany({
            where: { tenantId: ctx.tenantId, status: { notIn: [...TERMINAL_WORK_ITEM_STATUSES] } },
            select: { id: true },
        })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const issueIds = issues.map((i: any) => i.id);

    return {
        frameworkKey: 'ISO27001',
        selection: {
            controls: { count: controlIds.length, ids: controlIds },
            policies: { count: policyIds.length, ids: policyIds },
            evidence: { count: evidenceIds.length, ids: evidenceIds },
            issues: { count: issueIds.length, ids: issueIds },
        },
        totalItems: controlIds.length + policyIds.length + evidenceIds.length + issueIds.length,
    };
}

async function previewNIS2DefaultPack(ctx: RequestContext) {
    const fw = await runInTenantContext(ctx, (tdb) => tdb.framework.findFirst({ where: { key: 'NIS2' } }));

    // Controls mapped to NIS2 requirements (Art.21 measures)
    let controlIds: string[] = [];
    if (fw) {
        const links = await runInTenantContext(ctx, (tdb) =>
            tdb.controlRequirementLink.findMany({
                where: { tenantId: ctx.tenantId, requirement: { frameworkId: fw.id } },
                select: { controlId: true },
            })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        controlIds = [...new Set(links.map((l: any) => l.controlId))];
    }

    if (controlIds.length === 0) {
        const controls = await runInTenantContext(ctx, (tdb) =>
            tdb.control.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true } })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        controlIds = controls.map((c: any) => c.id);
    }

    // NIS2-relevant policies: incident response, BC/DR, access control, supplier security
    const policies = await runInTenantContext(ctx, (tdb) =>
        tdb.policy.findMany({
            where: { tenantId: ctx.tenantId },
            select: { id: true, title: true, category: true },
        })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any[];
    const nis2Keywords = ['incident', 'business continuity', 'disaster recovery', 'access control', 'supplier', 'supply chain'];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nis2Policies = policies.filter((p: any) => {
        const text = `${p.title} ${p.category || ''}`.toLowerCase();
        return nis2Keywords.some(kw => text.includes(kw));
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const policyIds = (nis2Policies.length > 0 ? nis2Policies : policies).map((p: any) => p.id);

    // Evidence tied to controls (via direct Control.evidence relation)
    const controlsWithEvidence = await runInTenantContext(ctx, (tdb) =>
        tdb.control.findMany({
            where: { tenantId: ctx.tenantId, id: { in: controlIds } },
            select: { evidence: { select: { id: true } } },
        })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evidenceIds = [...new Set(controlsWithEvidence.flatMap((c: any) => c.evidence.map((e: any) => e.id)))];

    // Issues
    const issues = await runInTenantContext(ctx, (tdb) =>
        tdb.task.findMany({
            where: { tenantId: ctx.tenantId, status: { notIn: [...TERMINAL_WORK_ITEM_STATUSES] } },
            select: { id: true },
        })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const issueIds = issues.map((i: any) => i.id);

    return {
        frameworkKey: 'NIS2',
        selection: {
            controls: { count: controlIds.length, ids: controlIds },
            policies: { count: policyIds.length, ids: policyIds },
            evidence: { count: evidenceIds.length, ids: evidenceIds },
            issues: { count: issueIds.length, ids: issueIds },
        },
        totalItems: controlIds.length + policyIds.length + evidenceIds.length + issueIds.length,
    };
}

// в”Ђв”Ђв”Ђ Export Primitives в”Ђв”Ђв”Ђ

export async function exportAuditPack(ctx: RequestContext, packId: string, format: 'json' | 'csv' = 'json') {
    assertCanViewPack(ctx);
    const pack = await getAuditPack(ctx, packId);
    if (pack.status === 'DRAFT') throw badRequest('Cannot export a draft pack');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = pack.items.map((item: any) => ({
        entityType: item.entityType,
        entityId: item.entityId,
        sortOrder: item.sortOrder,
        snapshot: JSON.parse(item.snapshotJson || '{}'),
    }));

    if (format === 'json') {
        return {
            pack: { id: pack.id, name: pack.name, status: pack.status, frozenAt: pack.frozenAt },
            cycle: pack.cycle,
            items,
        };
    }

    // CSV
    const rows: string[][] = [
        ['Type', 'Entity ID', 'Name/Title', 'Status', 'Details'],
    ];
    for (const item of items) {
        const s = item.snapshot;
        rows.push([
            item.entityType,
            item.entityId,
            s.code || s.title || s.name || '',
            s.status || '',
            JSON.stringify(s),
        ]);
    }

    const csv = rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    return { csv, filename: `${pack.name.replace(/\s+/g, '-')}-audit-pack.csv` };
}
