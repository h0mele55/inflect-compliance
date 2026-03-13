/**
 * Evidence retention usecases:
 * - updateEvidenceRetention
 * - listExpiringEvidence
 * - listExpiredEvidence
 * - archiveEvidence
 * - unarchiveEvidence
 */
import { RequestContext } from '../types';
import { assertCanRead, assertCanWrite, assertCanAdmin } from '../policies/common';
import { logEvent } from '../events/audit';
import { runInTenantContext } from '@/lib/db-context';
import { notFound } from '@/lib/errors/types';
import { runEvidenceRetentionSweep } from '../jobs/retention';

/**
 * Update retention settings on an evidence record.
 * ADMIN/EDITOR only.
 */
export async function updateEvidenceRetention(
    ctx: RequestContext,
    evidenceId: string,
    data: {
        retentionUntil?: string | null;
        retentionPolicy?: string;
        retentionDays?: number | null;
    },
) {
    assertCanWrite(ctx);

    return runInTenantContext(ctx, async (db) => {
        const evidence = await db.evidence.findFirst({
            where: { id: evidenceId, tenantId: ctx.tenantId },
        });
        if (!evidence) throw notFound('Evidence not found');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: any = {};
        if (data.retentionUntil !== undefined) {
            updateData.retentionUntil = data.retentionUntil ? new Date(data.retentionUntil) : null;
        }
        if (data.retentionPolicy !== undefined) {
            updateData.retentionPolicy = data.retentionPolicy;
        }
        if (data.retentionDays !== undefined) {
            updateData.retentionDays = data.retentionDays;
        }

        // If retentionPolicy is DAYS_AFTER_UPLOAD and retentionDays set, compute retentionUntil
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ev = evidence as any;
        if (
            (data.retentionPolicy === 'DAYS_AFTER_UPLOAD' || ev.retentionPolicy === 'DAYS_AFTER_UPLOAD') &&
            (data.retentionDays ?? ev.retentionDays)
        ) {
            const days = data.retentionDays ?? ev.retentionDays ?? 0;
            const base = evidence.createdAt;
            updateData.retentionUntil = new Date(base.getTime() + days * 86_400_000);
        }

        const updated = await db.evidence.update({
            where: { id: evidenceId },
            data: updateData,
        });

        await logEvent(db, ctx, {
            action: 'EVIDENCE_RETENTION_UPDATED',
            entityType: 'Evidence',
            entityId: evidenceId,
            details: JSON.stringify({
                retentionUntil: updateData.retentionUntil,
                retentionPolicy: updateData.retentionPolicy,
                retentionDays: updateData.retentionDays,
            }),
        });

        return updated;
    });
}

/**
 * List evidence expiring within N days.
 */
export async function listExpiringEvidence(ctx: RequestContext, days: number = 30) {
    assertCanRead(ctx);
    const future = new Date(Date.now() + days * 86_400_000);

    return runInTenantContext(ctx, (db) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (db.evidence as any).findMany({
            where: {
                tenantId: ctx.tenantId,
                retentionUntil: { not: null, lte: future },
                isArchived: false,
                deletedAt: null,
            },
            orderBy: { retentionUntil: 'asc' },
            include: {
                control: { select: { id: true, name: true, annexId: true } },
            },
        }),
    );
}

/**
 * List already-expired evidence (isArchived=true by retention sweep).
 */
export async function listExpiredEvidence(ctx: RequestContext) {
    assertCanRead(ctx);

    return runInTenantContext(ctx, (db) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (db.evidence as any).findMany({
            where: {
                tenantId: ctx.tenantId,
                expiredAt: { not: null },
                deletedAt: null,
            },
            orderBy: { expiredAt: 'desc' },
            include: {
                control: { select: { id: true, name: true, annexId: true } },
            },
        }),
    );
}

/**
 * Archive evidence manually. ADMIN/EDITOR only.
 */
export async function archiveEvidence(ctx: RequestContext, evidenceId: string) {
    assertCanWrite(ctx);

    return runInTenantContext(ctx, async (db) => {
        const evidence = await db.evidence.findFirst({
            where: { id: evidenceId, tenantId: ctx.tenantId },
        });
        if (!evidence) throw notFound('Evidence not found');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((evidence as any).isArchived) return evidence; // idempotent

        const updated = await db.evidence.update({
            where: { id: evidenceId },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: { isArchived: true } as any,
        });

        await logEvent(db, ctx, {
            action: 'EVIDENCE_ARCHIVED',
            entityType: 'Evidence',
            entityId: evidenceId,
            details: JSON.stringify({ title: evidence.title, reason: 'manual' }),
        });

        return updated;
    });
}

/**
 * Unarchive evidence. ADMIN/EDITOR only.
 */
export async function unarchiveEvidence(ctx: RequestContext, evidenceId: string) {
    assertCanWrite(ctx);

    return runInTenantContext(ctx, async (db) => {
        const evidence = await db.evidence.findFirst({
            where: { id: evidenceId, tenantId: ctx.tenantId },
        });
        if (!evidence) throw notFound('Evidence not found');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!(evidence as any).isArchived) return evidence; // idempotent

        const updated = await db.evidence.update({
            where: { id: evidenceId },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: { isArchived: false } as any,
        });

        await logEvent(db, ctx, {
            action: 'EVIDENCE_UNARCHIVED',
            entityType: 'Evidence',
            entityId: evidenceId,
            details: JSON.stringify({ title: evidence.title }),
        });

        return updated;
    });
}

/**
 * Run retention sweep (ADMIN only or system job).
 */
export async function runRetentionSweepUsecase(
    ctx: RequestContext,
    options: { dryRun?: boolean } = {},
) {
    assertCanAdmin(ctx);
    return runEvidenceRetentionSweep({
        tenantId: ctx.tenantId,
        dryRun: options.dryRun,
    });
}

/**
 * Get retention metrics for the tenant.
 */
export async function getRetentionMetrics(ctx: RequestContext) {
    assertCanRead(ctx);
    const now = new Date();
    const in30Days = new Date(Date.now() + 30 * 86_400_000);

    return runInTenantContext(ctx, async (db) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dbAny = db.evidence as any;

        const expiringCount = await dbAny.count({
            where: {
                tenantId: ctx.tenantId,
                retentionUntil: { not: null, lte: in30Days, gt: now },
                isArchived: false,
                deletedAt: null,
            },
        });

        const archivedCount = await dbAny.count({
            where: {
                tenantId: ctx.tenantId,
                isArchived: true,
                deletedAt: null,
            },
        });

        const expiredCount = await dbAny.count({
            where: {
                tenantId: ctx.tenantId,
                expiredAt: { not: null },
                isArchived: false,
                deletedAt: null,
            },
        });

        // Top controls with expiring evidence
        const expiringEvidence = await dbAny.findMany({
            where: {
                tenantId: ctx.tenantId,
                retentionUntil: { not: null, lte: in30Days, gt: now },
                isArchived: false,
                deletedAt: null,
                controlId: { not: null },
            },
            select: { controlId: true, control: { select: { id: true, name: true, annexId: true } } },
        });

        const controlMap = new Map<string, { controlId: string; name: string; annexId: string; count: number }>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const ev of expiringEvidence as any[]) {
            const key = ev.controlId;
            if (!controlMap.has(key)) {
                controlMap.set(key, {
                    controlId: key,
                    name: ev.control?.name || 'Unknown',
                    annexId: ev.control?.annexId || '',
                    count: 0,
                });
            }
            controlMap.get(key)!.count++;
        }

        const topControlsWithExpiringEvidence = [...controlMap.values()]
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        return {
            expiringCount,
            archivedCount,
            expiredCount,
            topControlsWithExpiringEvidence,
        };
    });
}

/**
 * Assert that evidence is not archived. Use before linking evidence.
 * Throws badRequest if archived.
 */
export async function assertNotArchived(ctx: RequestContext, evidenceId: string) {
    return runInTenantContext(ctx, async (db) => {
        const evidence = await db.evidence.findFirst({
            where: { id: evidenceId, tenantId: ctx.tenantId },
        });
        if (!evidence) throw notFound('Evidence not found');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((evidence as any).isArchived) {
            const { badRequest } = await import('@/lib/errors/types');
            throw badRequest('Cannot link archived evidence. Unarchive first or use active evidence.');
        }
        return evidence;
    });
}
