import { RequestContext } from '../types';
import { AuditRepository } from '../repositories/AuditRepository';
import { assertCanRead, assertCanWrite } from '../policies/common';
import { logEvent } from '../events/audit';
import { notFound } from '@/lib/errors/types';
import { runInTenantContext } from '@/lib/db-context';
import type { AuditStatus } from '@prisma/client';

export async function listAudits(ctx: RequestContext) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        AuditRepository.list(db, ctx)
    );
}

export async function getAudit(ctx: RequestContext, id: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const audit = await AuditRepository.getById(db, ctx, id);
        if (!audit) throw notFound('Audit not found');
        return audit;
    });
}

export async function createAudit(ctx: RequestContext, data: {
    title: string;
    scope?: string | null;
    criteria?: string | null;
    schedule?: string | null;
    auditors?: string | null;
    auditees?: string | null;
    departments?: string | null;
    generateChecklist?: boolean;
}) {
    assertCanWrite(ctx);

    return runInTenantContext(ctx, async (db) => {
        const audit = await AuditRepository.create(db, ctx, {
            title: data.title,
            auditScope: data.scope,
            criteria: data.criteria,
            schedule: data.schedule ? new Date(data.schedule) : null,
            auditors: data.auditors,
            auditees: data.auditees,
            departments: data.departments,
            status: 'PLANNED',
        });

        if (data.generateChecklist) {
            const controls = await db.control.findMany({
                where: { OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] },
                take: 20,
            });

            const items = [
                'Verify information security policy is current and approved',
                'Confirm roles and responsibilities are documented',
                'Review risk assessment methodology and results',
                'Check that risk treatment plan is being executed',
                'Verify security awareness training records',
                'Review access control procedures and logs',
                'Check incident response procedures',
                'Verify backup and recovery procedures',
                'Review change management records',
                'Check monitoring and logging configuration',
            ];

            for (let i = 0; i < items.length; i++) {
                await AuditRepository.createChecklistItem(db, ctx, audit.id, items[i], i);
            }

            for (const ctrl of controls.slice(0, 10)) {
                const prompt = `Verify control "${ctrl.name}" (${ctrl.annexId || 'Custom'}): Check implementation status and evidence`;
                await AuditRepository.createChecklistItem(db, ctx, audit.id, prompt, items.length + controls.indexOf(ctrl));
            }
        }

        await logEvent(db, ctx, {
            action: 'CREATE',
            entityType: 'Audit',
            entityId: audit.id,
            details: `Created audit: ${audit.title}`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'Audit',
                operation: 'created',
                after: { title: audit.title, status: 'PLANNED', generateChecklist: !!data.generateChecklist },
                summary: `Created audit: ${audit.title}`,
            },
        });

        return audit;
    });
}

export async function updateAudit(ctx: RequestContext, id: string, data: {
    title?: string;
    scope?: string | null;
    criteria?: string | null;
    status?: string;
    auditors?: string | null;
    auditees?: string | null;
    checklistUpdates?: { id: string; result: string; notes?: string }[];
}) {
    assertCanWrite(ctx);

    return runInTenantContext(ctx, async (db) => {
        const audit = await AuditRepository.update(db, ctx, id, {
            title: data.title,
            auditScope: data.scope,
            criteria: data.criteria,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma enum boundary
            status: data.status as AuditStatus | undefined,
            auditors: data.auditors,
            auditees: data.auditees,
        });

        if (!audit) throw notFound('Audit not found');

        if (data.checklistUpdates) {
            for (const item of data.checklistUpdates) {
                await AuditRepository.updateChecklistItem(db, ctx, item.id, {
                    result: item.result,
                    notes: item.notes,
                });
            }
        }

        await logEvent(db, ctx, {
            action: 'UPDATE',
            entityType: 'Audit',
            entityId: id,
            details: JSON.stringify(data),
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'Audit',
                operation: 'updated',
                changedFields: Object.keys(data).filter(k => data[k as keyof typeof data] !== undefined),
                summary: 'Audit updated',
            },
        });

        return audit;
    });
}
