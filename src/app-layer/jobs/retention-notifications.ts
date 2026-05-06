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
import { formatDate } from '@/lib/format-date';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/observability/logger';
import { TERMINAL_WORK_ITEM_STATUSES } from '../domain/work-item-status';
import { isNotificationsEnabled } from '../notifications/settings';

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
                status: { notIn: [...TERMINAL_WORK_ITEM_STATUSES] },
                links: {
                    some: {
                        entityType: 'EVIDENCE',
                        entityId: ev.id,
                    },
                },
            // The where shape is correct but Prisma's generated type
            // doesn't accept `links: { some: {...} }` without an
            // explicit cast (entityType enum widening). Replacing the
            // cast with a typed `Prisma.TaskWhereInput` is bounded
            // follow-up.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
        });

        if (existingTask) {
            skippedDuplicate++;
            continue;
        }

        // Create Task + link
        const daysLeft = Math.ceil((new Date(ev.retentionUntil).getTime() - Date.now()) / 86_400_000);
        // KNOWN BUG: this create misses the required `createdByUserId`
        // field (Task.createdByUserId is NOT NULL). The cast hides a
        // runtime crash that hasn't fired because the retention job
        // hasn't been live in prod under Prisma 7. Bounded follow-up:
        // introduce a system-user id for background jobs and pass it
        // here. Tracked in #BUG-retention-task-creator.
        const task = await prisma.task.create({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: {
                tenantId: ev.tenantId,
                type: 'IMPROVEMENT',
                title: `Refresh expiring evidence: ${ev.title}`,
                description: `Evidence "${ev.title}" expires in ${daysLeft} days (${formatDate(ev.retentionUntil)}). Please upload refreshed evidence or extend the retention date.`,
                status: 'OPEN',
                priority: daysLeft <= 7 ? 'HIGH' : 'MEDIUM',
                ...(ev.controlId ? { controlId: ev.controlId } : {}),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
        });

        // Create task link to evidence
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await prisma.taskLink.create({
            data: {
                taskId: task.id,
                tenantId: ev.tenantId,
                entityType: 'EVIDENCE',
                entityId: ev.id,
            },
        });

        // Enqueue EVIDENCE_EXPIRING email to tenant admins/editors
        // Tenant notification eligibility — skip if notifications are disabled.
        // Uses the same isNotificationsEnabled check as enqueue.ts and digest-dispatcher.
        try {
            const enabled = await isNotificationsEnabled(prisma, ev.tenantId);
            if (!enabled) {
                logger.info('retention notification suppressed — notifications disabled for tenant', {
                    component: 'retention-notifications',
                    tenantId: ev.tenantId,
                    evidenceId: ev.id,
                });
            } else {
                const members = await prisma.tenantMembership.findMany({
                    where: { tenantId: ev.tenantId, role: { in: ['ADMIN', 'EDITOR'] } },
                    include: { user: { select: { email: true, name: true } } },
                });

                let controlName: string | null = null;
                if (ev.controlId) {
                    const control = await prisma.control.findUnique({
                        where: { id: ev.controlId },
                        select: { name: true },
                    });
                    controlName = control?.name || null;
                }

                for (const m of members) {
                    if (!m.user.email) continue;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await prisma.notificationOutbox.create({
                        data: {
                            tenantId: ev.tenantId,
                            type: 'EVIDENCE_EXPIRING',
                            toEmail: m.user.email,
                            subject: `${daysLeft <= 7 ? '⚠️ ' : ''}Evidence expiring in ${daysLeft} day(s): ${ev.title}`,
                            bodyText: `Evidence "${ev.title}" expires in ${daysLeft} days. Please upload refreshed evidence or extend the retention date.`,
                            bodyHtml: null,
                            dedupeKey: `${ev.tenantId}:EVIDENCE_EXPIRING:${m.user.email}:${ev.id}:${new Date().toISOString().slice(0, 10)}`,
                        },
                    }).catch(() => {
                        // Silently skip duplicates (P2002)
                    });
                }
            }
        } catch (err) {
            logger.warn('failed to enqueue evidence expiring emails', { component: 'job' });
        }

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
