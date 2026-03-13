import { RequestContext } from '../types';
import { EvidenceRepository } from '../repositories/EvidenceRepository';
import { assertCanRead, assertCanWrite, assertCanAdmin } from '../policies/common';
import { logEvent } from '../events/audit';
import { validateFile, uploadFile } from '@/lib/storage';
import prisma from '@/lib/prisma';
import { notFound, badRequest, forbidden } from '@/lib/errors/types';
import { runInTenantContext } from '@/lib/db-context';
import type { EvidenceType, ReviewCadence } from '@prisma/client';

export async function listEvidence(ctx: RequestContext) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        EvidenceRepository.list(db, ctx)
    );
}

export async function getEvidence(ctx: RequestContext, id: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const evidence = await EvidenceRepository.getById(db, ctx, id);
        if (!evidence) throw notFound('Evidence not found');
        return evidence;
    });
}

export async function createEvidence(ctx: RequestContext, data: {
    type: string;
    title: string;
    content?: string | null;
    fileName?: string | null;
    fileSize?: number | null;
    controlId?: string | null;
    category?: string;
    owner?: string;
    reviewCycle?: string | null;
    nextReviewDate?: string | null;
    file?: File;
}) {
    assertCanWrite(ctx);

    // File upload happens outside the tenant transaction (filesystem I/O)
    let fileName = data.fileName || null;
    let fileSize = data.fileSize || null;
    let content = data.content || null;

    if (data.type === 'FILE' && data.file) {
        try {
            validateFile(data.file as File, { maxSizeMB: 20 });
            const uploadResult = await uploadFile(data.file as File);
            fileName = uploadResult.originalName;
            fileSize = uploadResult.size;
            content = uploadResult.fileName;
        } catch (err: unknown) {
            throw badRequest('FILE_VALIDATION_ERROR', err instanceof Error ? err.message : 'File upload failed');
        }
    }

    return runInTenantContext(ctx, async (db) => {
        const evidence = await EvidenceRepository.create(db, ctx, {
            controlId: data.controlId || null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma enum boundary
            type: data.type as EvidenceType,
            title: data.title,
            content,
            fileName,
            fileSize,
            category: data.category,
            owner: data.owner,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma enum boundary
            reviewCycle: (data.reviewCycle || null) as ReviewCadence | null,
            nextReviewDate: data.nextReviewDate ? new Date(data.nextReviewDate) : null,
            status: 'DRAFT',
        });

        await logEvent(db, ctx, {
            action: 'CREATE',
            entityType: 'Evidence',
            entityId: evidence.id,
            details: `Created evidence: ${evidence.title}`,
        });

        return evidence;
    });
}

export async function updateEvidence(ctx: RequestContext, id: string, data: {
    title?: string;
    content?: string | null;
    category?: string;
    owner?: string;
    reviewCycle?: string;
    nextReviewDate?: string | null;
}) {
    assertCanWrite(ctx);

    return runInTenantContext(ctx, async (db) => {
        const evidence = await EvidenceRepository.update(db, ctx, id, {
            title: data.title,
            content: data.content,
            category: data.category,
            owner: data.owner,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma enum boundary
            reviewCycle: data.reviewCycle as ReviewCadence | undefined,
            nextReviewDate: data.nextReviewDate ? new Date(data.nextReviewDate) : undefined,
        });

        if (!evidence) throw notFound('Evidence not found');

        await logEvent(db, ctx, {
            action: 'UPDATE',
            entityType: 'Evidence',
            entityId: id,
            details: JSON.stringify(data),
        });

        return evidence;
    });
}

export async function reviewEvidence(ctx: RequestContext, id: string, data: { action: string; comment?: string | null }) {
    const { action, comment } = data;

    if (action === 'SUBMITTED') {
        assertCanWrite(ctx); // EDITOR
    } else if (action === 'APPROVED' || action === 'REJECTED') {
        assertCanAdmin(ctx); // ADMIN
    } else {
        throw badRequest('Invalid review action');
    }

    return runInTenantContext(ctx, async (db) => {
        const evidence = await EvidenceRepository.getById(db, ctx, id);
        if (!evidence) throw notFound('Evidence not found');

        const newStatus = action as 'SUBMITTED' | 'APPROVED' | 'REJECTED';

        await EvidenceRepository.update(db, ctx, id, { status: newStatus });
        await EvidenceRepository.addReview(db, ctx, id, newStatus, comment);

        // Create notification — User lookup uses global prisma (User table has no RLS)
        if (newStatus === 'APPROVED' || newStatus === 'REJECTED') {
            const ownerUser = evidence.owner
                ? await prisma.user.findFirst({ where: { tenantId: ctx.tenantId, name: evidence.owner } })
                : null;
            if (ownerUser) {
                await db.notification.create({
                    data: {
                        tenantId: ctx.tenantId,
                        userId: ownerUser.id,
                        type: newStatus === 'APPROVED' ? 'EVIDENCE_APPROVED' : 'EVIDENCE_REJECTED',
                        title: `Evidence ${newStatus.toLowerCase()}: ${evidence.title}`,
                        message: comment || `Your evidence "${evidence.title}" has been ${newStatus.toLowerCase()}.`,
                        linkUrl: `/evidence`,
                    },
                });
            }
        }

        await logEvent(db, ctx, {
            action: 'STATUS_CHANGE',
            entityType: 'Evidence',
            entityId: id,
            details: `Evidence ${action}: ${comment || ''}`,
        });

        return { success: true, status: newStatus };
    });
}

// ─── Soft Delete / Restore / Purge ───

import { restoreEntity, purgeEntity } from './soft-delete-operations';
import { withDeleted } from '@/lib/soft-delete';

export async function deleteEvidence(ctx: RequestContext, id: string) {
    assertCanAdmin(ctx);
    return runInTenantContext(ctx, async (db) => {
        const evidence = await EvidenceRepository.getById(db, ctx, id);
        if (!evidence) throw notFound('Evidence not found');

        await db.evidence.delete({ where: { id } });

        await logEvent(db, ctx, {
            action: 'SOFT_DELETE',
            entityType: 'Evidence',
            entityId: id,
            details: `Evidence soft-deleted: ${evidence.title}`,
        });
        return { success: true };
    });
}

export async function restoreEvidence(ctx: RequestContext, id: string) {
    return restoreEntity(ctx, 'Evidence', id);
}

export async function purgeEvidence(ctx: RequestContext, id: string) {
    return purgeEntity(ctx, 'Evidence', id);
}

export async function listEvidenceWithDeleted(ctx: RequestContext) {
    assertCanAdmin(ctx);
    return runInTenantContext(ctx, (db) =>
        db.evidence.findMany(withDeleted({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: 'desc' as const } }))
    );
}

/**
 * GET evidence metrics — ADMIN only.
 */
export async function getEvidenceMetrics(ctx: RequestContext) {
    assertCanAdmin(ctx);
    const tenantId = ctx.tenantId;

    const [totalEvidence, fileEvidence, linkedFileEvidence, fileRecordAgg, topControls] = await Promise.all([
        prisma.evidence.count({ where: { tenantId, deletedAt: null } }),
        prisma.evidence.count({ where: { tenantId, type: 'FILE', deletedAt: null } }),
        prisma.evidence.count({ where: { tenantId, type: 'FILE', controlId: { not: null }, deletedAt: null } }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma as any).fileRecord.aggregate({
            where: { tenantId, status: 'STORED' },
            _sum: { sizeBytes: true },
            _count: { id: true },
        }),
        prisma.evidence.groupBy({
            by: ['controlId'],
            where: { tenantId, controlId: { not: null }, deletedAt: null },
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } },
            take: 10,
        }),
    ]);

    const controlIds = topControls
        .map((g: { controlId: string | null }) => g.controlId)
        .filter(Boolean) as string[];
    const controlNames = controlIds.length > 0
        ? await prisma.control.findMany({
            where: { id: { in: controlIds } },
            select: { id: true, name: true, annexId: true, code: true },
        })
        : [];

    const controlLookup = new Map(controlNames.map(c => [c.id, c]));
    const totalBytesStored = fileRecordAgg._sum?.sizeBytes ?? 0;
    const storedFileCount = fileRecordAgg._count?.id ?? 0;
    const linkedRate = fileEvidence > 0 ? Math.round((linkedFileEvidence / fileEvidence) * 100) : 0;

    return {
        totalEvidence,
        fileEvidence,
        linkedFileEvidence,
        linkedRate,
        storedFileCount,
        totalBytesStored,
        totalBytesFormatted: totalBytesStored < 1048576
            ? `${(totalBytesStored / 1024).toFixed(1)} KB`
            : `${(totalBytesStored / 1048576).toFixed(1)} MB`,
        topControlsByEvidence: topControls.map((g: { controlId: string | null; _count: { id: number } }) => {
            const ctrl = g.controlId ? controlLookup.get(g.controlId) : null;
            return {
                controlId: g.controlId,
                controlName: ctrl ? `${ctrl.annexId || ctrl.code || ''} ${ctrl.name}`.trim() : '—',
                evidenceCount: g._count.id,
            };
        }),
    };
}

// ─── File Upload / Download ───

import { FileRepository } from '../repositories/FileRepository';
import {
    generatePathKey,
    streamWriteFile,
    streamReadFile,
    deleteStoredFile,
    isAllowedMime,
    isAllowedSize,
    FILE_MAX_SIZE_BYTES,
} from '@/lib/storage';
import { Readable } from 'stream';

/**
 * Upload a file and create an Evidence record of type FILE in one flow.
 * Streams to disk + computes SHA-256 + creates FileRecord + Evidence.
 * Supports SHA-256 dedup: reuses existing FileRecord if same hash+tenant.
 */
export async function uploadEvidenceFile(
    ctx: RequestContext,
    file: File,
    metadata: {
        title?: string;
        controlId?: string | null;
        category?: string | null;
        owner?: string | null;
        reviewCycle?: string | null;
        nextReviewDate?: string | null;
    },
) {
    assertCanWrite(ctx);

    // Validate before writing
    const mimeType = file.type || 'application/octet-stream';
    if (!isAllowedMime(mimeType)) {
        throw badRequest('FILE_TYPE_NOT_ALLOWED', `MIME type "${mimeType}" is not allowed`);
    }
    if (!isAllowedSize(file.size)) {
        throw badRequest('FILE_TOO_LARGE', `File exceeds maximum size of ${FILE_MAX_SIZE_BYTES} bytes`);
    }

    const originalName = file.name || 'unnamed';
    const pathKey = generatePathKey(ctx.tenantId, originalName);

    // Stream to disk with incremental SHA-256
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const readable = Readable.from(buffer);

    const writeResult = await streamWriteFile(pathKey, readable);

    // Create FileRecord + Evidence in a transaction
    return runInTenantContext(ctx, async (db) => {
        // ─── SHA-256 Dedup ───
        const existingFile = await FileRepository.findBySha256(db, ctx.tenantId, writeResult.sha256);
        let fileRecordId: string;
        let deduplicated = false;

        if (existingFile && existingFile.status === 'STORED') {
            // Reuse existing FileRecord — delete the new file from disk
            fileRecordId = existingFile.id;
            deduplicated = true;
            try { await deleteStoredFile(pathKey); } catch { /* best effort */ }
        } else {
            // Create new FileRecord
            const fileRecord = await FileRepository.createPending(db, ctx, {
                pathKey,
                originalName,
                mimeType,
                sizeBytes: writeResult.sizeBytes,
                sha256: writeResult.sha256,
            });
            await FileRepository.markStored(db, ctx, fileRecord.id);
            fileRecordId = fileRecord.id;
        }

        // Create Evidence linked to FileRecord
        const evidence = await EvidenceRepository.create(db, ctx, {
            type: 'FILE' as EvidenceType,
            title: metadata.title || originalName,
            content: pathKey,
            fileName: originalName,
            fileSize: writeResult.sizeBytes,
            fileRecordId,
            controlId: metadata.controlId || null,
            category: metadata.category || undefined,
            owner: metadata.owner || undefined,
            reviewCycle: (metadata.reviewCycle || null) as ReviewCadence | null,
            nextReviewDate: metadata.nextReviewDate ? new Date(metadata.nextReviewDate) : null,
            status: 'DRAFT',
        });

        const eventAction = deduplicated ? 'FILE_DEDUP_REUSED' : 'EVIDENCE_FILE_UPLOADED';
        await logEvent(db, ctx, {
            action: eventAction,
            entityType: 'Evidence',
            entityId: evidence.id,
            details: JSON.stringify({
                fileRecordId,
                originalName,
                mimeType,
                sizeBytes: writeResult.sizeBytes,
                sha256: writeResult.sha256,
                deduplicated,
            }),
        });

        return {
            ...evidence,
            fileRecord: {
                id: fileRecordId,
                originalName,
                mimeType,
                sizeBytes: writeResult.sizeBytes,
                sha256: writeResult.sha256,
                status: 'STORED',
                deduplicated,
            },
        };
    });
}

/**
 * Get file metadata for secure download (tenant check).
 */
export async function getEvidenceFileRecord(ctx: RequestContext, fileId: string) {
    assertCanRead(ctx);

    return runInTenantContext(ctx, async (db) => {
        const fileRecord = await FileRepository.getById(db, ctx, fileId);
        if (!fileRecord) throw notFound('File not found');
        if (fileRecord.status === 'DELETED') throw notFound('File has been deleted');
        return fileRecord;
    });
}

/**
 * STRICT DOWNLOAD POLICY (Option A):
 * - ADMIN/EDITOR: can download any tenant file evidence.
 * - READER/AUDITOR: can download ONLY if evidence is linked to a control (controlId not null).
 * - Soft-deleted evidence blocks download for all roles.
 */
export async function downloadEvidenceFile(ctx: RequestContext, fileId: string) {
    assertCanRead(ctx);

    return runInTenantContext(ctx, async (db) => {
        const fileRecord = await FileRepository.getById(db, ctx, fileId);
        if (!fileRecord) throw notFound('File not found');
        if (fileRecord.status !== 'STORED') throw notFound('File is not available for download');

        // ─── Strict Policy: control-aware access ───
        // Find evidence linked to this FileRecord
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const evidence = await (db.evidence as any).findFirst({
            where: { tenantId: ctx.tenantId, fileRecordId: fileId },
            select: { id: true, controlId: true, deletedAt: true },
        });

        // Block download of soft-deleted evidence
        if (evidence?.deletedAt) {
            throw notFound('Evidence has been deleted');
        }

        // READER/AUDITOR: must be linked to a control
        if (!ctx.permissions.canWrite) {
            if (!evidence?.controlId) {
                throw forbidden('You can only download evidence that is linked to a control. Contact an admin to link this evidence.');
            }
        }

        await logEvent(db, ctx, {
            action: 'EVIDENCE_DOWNLOADED',
            entityType: 'FileRecord',
            entityId: fileId,
            details: JSON.stringify({
                originalName: fileRecord.originalName,
                role: ctx.role,
                controlLinked: !!evidence?.controlId,
            }),
        });

        return {
            stream: streamReadFile(fileRecord.pathKey),
            originalName: fileRecord.originalName,
            mimeType: fileRecord.mimeType,
            sizeBytes: fileRecord.sizeBytes,
            sha256: fileRecord.sha256,
        };
    });
}
