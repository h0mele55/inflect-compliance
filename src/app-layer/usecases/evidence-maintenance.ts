/**
 * Evidence maintenance jobs:
 * - Reconcile unlinked evidence
 * - Cleanup failed/pending uploads
 * - Detect broken evidence (missing files)
 */
import { prisma } from '@/lib/prisma';
import { deleteStoredFile } from '@/lib/storage';

/**
 * Find FILE evidence not linked to any control after N minutes.
 * Emits EVIDENCE_UNLINKED_WARNING events for admin review.
 */
export async function reconcileUnlinkedEvidence(
    tenantId: string,
    olderThanMinutes: number = 60,
) {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);

    const unlinked = await prisma.evidence.findMany({
        where: {
            tenantId,
            type: 'FILE',
            controlId: null,
            createdAt: { lt: cutoff },
            deletedAt: null,
        },
        select: { id: true, title: true, fileName: true, createdAt: true },
    });

    if (unlinked.length > 0) {
        await prisma.auditLog.createMany({
            data: unlinked.map(ev => ({
                tenantId,
                entity: 'Evidence',
                entityId: ev.id,
                action: 'EVIDENCE_UNLINKED_WARNING',
                details: JSON.stringify({
                    title: ev.title,
                    fileName: ev.fileName,
                    unlinkedSince: ev.createdAt,
                }),
            })),
        });
    }

    return { flagged: unlinked.length, items: unlinked };
}

/**
 * Cleanup old PENDING/FAILED FileRecords: delete temp files and mark FAILED.
 */
export async function cleanupFailedOrPendingUploads(
    tenantId: string,
    olderThanMinutes: number = 30,
) {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
    const pending = await (prisma as any).fileRecord.findMany({     // eslint-disable-line @typescript-eslint/no-explicit-any
        where: {
            tenantId,
            status: { in: ['PENDING', 'FAILED'] },
            createdAt: { lt: cutoff },
        },
    });

    let cleaned = 0;
    for (const record of pending) {
        try {
            await deleteStoredFile(record.pathKey);
        } catch { /* best effort */ }

        await (prisma as any).fileRecord.update({                   // eslint-disable-line @typescript-eslint/no-explicit-any
            where: { id: record.id },
            data: { status: 'FAILED' },
        });
        cleaned++;
    }

    return { cleaned };
}

/**
 * Detect evidence records that reference missing/broken FileRecords.
 * Marks them for admin review.
 */
export async function detectBrokenEvidence(tenantId: string) {
    // Find FILE evidence — use raw query approach to handle stale Prisma types
    const fileEvidence = await prisma.evidence.findMany({
        where: { tenantId, type: 'FILE', deletedAt: null },
    });

    const broken: Array<{ id: string; title: string | null; reason: string }> = [];

    for (const ev of fileEvidence) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fileRecordId = (ev as any).fileRecordId as string | null;
        if (!fileRecordId) {
            broken.push({ id: ev.id, title: ev.title, reason: 'missing_file_record_id' });
            continue;
        }

        const record = await (prisma as any).fileRecord.findUnique({ // eslint-disable-line @typescript-eslint/no-explicit-any
            where: { id: fileRecordId },
            select: { status: true },
        });

        if (!record) {
            broken.push({ id: ev.id, title: ev.title, reason: 'file_record_not_found' });
        } else if (record.status === 'DELETED' || record.status === 'FAILED') {
            broken.push({ id: ev.id, title: ev.title, reason: `file_record_${record.status.toLowerCase()}` });
        }
    }

    if (broken.length > 0) {
        await prisma.auditLog.createMany({
            data: broken.map(b => ({
                tenantId,
                entity: 'Evidence',
                entityId: b.id,
                action: 'EVIDENCE_BROKEN_DETECTED',
                details: JSON.stringify({ title: b.title, reason: b.reason }),
            })),
        });
    }

    return { broken: broken.length, items: broken };
}
