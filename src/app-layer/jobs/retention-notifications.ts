/**
 * Evidence retention notification job.
 * Finds evidence expiring within N days and creates reminder Tasks.
 * Idempotent: checks for existing tasks with same evidenceId link.
 *
 * Usage:
 *   import { runEvidenceRetentionNotifications } from '@/app-layer/jobs/retention-notifications';
 *   await runEvidenceRetentionNotifications({ days: 30 });           // all tenants
 *   await runEvidenceRetentionNotifications({ tenantId: 'xxx' });    // single tenant
 */
import { prisma } from '@/lib/prisma';

export interface RetentionNotificationOptions {
    tenantId?: string;
    days?: number;
}

export interface RetentionNotificationResult {
    scanned: number;
    tasksCreated: number;
    skippedDuplicate: number;
}

export async function runEvidenceRetentionNotifications(
    options: RetentionNotificationOptions = {},
): Promise<RetentionNotificationResult> {
    const days = options.days ?? 30;
    const futureDate = new Date(Date.now() + days * 86_400_000);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
        retentionUntil: { not: null, lte: futureDate, gt: new Date() },
        isArchived: false,
        deletedAt: null,
    };
    if (options.tenantId) where.tenantId = options.tenantId;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expiring = await (prisma.evidence as any).findMany({
        where,
        select: {
            id: true, tenantId: true, title: true, owner: true, controlId: true,
            retentionUntil: true,
        },
    });

    let tasksCreated = 0;
    let skippedDuplicate = 0;

    for (const ev of expiring) {
        // Check for existing task with same evidence link (idempotent)
        const existingTask = await prisma.task.findFirst({
            where: {
                tenantId: ev.tenantId,
                type: 'IMPROVEMENT',
                status: { notIn: ['RESOLVED', 'CLOSED', 'CANCELED'] },
                links: {
                    some: {
                        entityType: 'EVIDENCE',
                        entityId: ev.id,
                    },
                },
            } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        });

        if (existingTask) {
            skippedDuplicate++;
            continue;
        }

        // Create Task + link
        const daysLeft = Math.ceil((new Date(ev.retentionUntil).getTime() - Date.now()) / 86_400_000);
        const task = await prisma.task.create({
            data: {
                tenantId: ev.tenantId,
                type: 'IMPROVEMENT',
                title: `Refresh expiring evidence: ${ev.title}`,
                description: `Evidence "${ev.title}" expires in ${daysLeft} days (${new Date(ev.retentionUntil).toLocaleDateString()}). Please upload refreshed evidence or extend the retention date.`,
                status: 'OPEN',
                priority: daysLeft <= 7 ? 'HIGH' : 'MEDIUM',
                ...(ev.controlId ? { controlId: ev.controlId } : {}),
            } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        });

        // Create task link to evidence
        await (prisma as any).taskLink.create({
            data: {
                taskId: task.id,
                tenantId: ev.tenantId,
                entityType: 'EVIDENCE',
                entityId: ev.id,
            },
        });

        // Audit event
        await prisma.auditLog.create({
            data: {
                tenantId: ev.tenantId,
                entity: 'Evidence',
                entityId: ev.id,
                action: 'EVIDENCE_EXPIRING_SOON',
                details: JSON.stringify({ daysLeft, taskId: task.id, title: ev.title }),
            },
        });

        tasksCreated++;
    }

    return { scanned: expiring.length, tasksCreated, skippedDuplicate };
}
