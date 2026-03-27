/**
 * Audit Readiness Hardening
 *
 * - Evidence integrity: SHA-256 hashing of file contents
 * - Immutable export artifacts: store export files, attach to packs
 * - Pack cloning for retest workflows
 * - Events: AUDIT_PACK_CLONED, RETEST_REQUESTED
 */
import { RequestContext } from '../types';
import {
    assertCanManageAuditPacks, assertCanFreezePack, assertCanViewPack,
} from '../policies/audit-readiness.policies';
import { logEvent } from '../events/audit';
import { runInTenantContext } from '@/lib/db-context';
import { notFound, badRequest, forbidden } from '@/lib/errors/types';
import { getStorageProvider, buildTenantObjectKey } from '@/lib/storage';
import crypto from 'crypto';

// ─── Evidence Integrity ───

export function computeFileHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

export async function verifyFileIntegrity(
    ctx: RequestContext,
    fileName: string,
    expectedHash?: string,
): Promise<{ fileName: string; computedHash: string; matches: boolean | null; fileSize: number }> {
    assertCanViewPack(ctx);

    const storage = getStorageProvider();
    const stream = storage.readStream(fileName);

    // Hash incrementally from stream
    const hash = crypto.createHash('sha256');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        hash.update(buf);
        chunks.push(buf);
    }
    const computedHash = hash.digest('hex');
    const totalSize = chunks.reduce((s, c) => s + c.length, 0);

    return {
        fileName,
        computedHash,
        matches: expectedHash ? computedHash === expectedHash : null,
        fileSize: totalSize,
    };
}

// ─── Immutable Export Artifacts ───

export async function storeExportArtifact(
    ctx: RequestContext,
    packId: string,
    content: string,
    filename: string,
    mimeType: string,
): Promise<{ fileName: string; hash: string }> {
    assertCanFreezePack(ctx);

    // Verify pack is frozen
    const pack = await runInTenantContext(ctx, (tdb) =>
        tdb.auditPack.findFirst({ where: { id: packId, tenantId: ctx.tenantId } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any;
    if (!pack) throw notFound('Pack not found');
    if (pack.status === 'DRAFT') throw badRequest('Cannot attach exports to a DRAFT pack');

    // Create buffer and compute hash
    const buffer = Buffer.from(content, 'utf-8');
    const hash = computeFileHash(buffer);

    // Write via storage abstraction
    const storage = getStorageProvider();
    const pathKey = buildTenantObjectKey(ctx.tenantId, 'exports', filename);
    const { Readable } = await import('stream');
    await storage.write(pathKey, Readable.from(buffer), { mimeType });

    // Add as AuditPackItem
    await runInTenantContext(ctx, (tdb) =>
        tdb.auditPackItem.create({
            data: {
                tenantId: ctx.tenantId,
                auditPackId: packId,
                entityType: 'FILE',
                entityId: pathKey,
                snapshotJson: JSON.stringify({
                    originalFilename: filename,
                    storedFilename: pathKey,
                    sha256: hash,
                    size: buffer.length,
                    mimeType,
                    generatedAt: new Date().toISOString(),
                }),
                sortOrder: 900,
            },
        })
    );

    await runInTenantContext(ctx, (tdb) =>
        logEvent(tdb, ctx, {
            action: 'AUDIT_EXPORT_GENERATED',
            entityType: 'AuditPack',
            entityId: packId,
            details: JSON.stringify({ filename, hash, size: buffer.length }),
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'AuditPack',
                operation: 'export_generated',
                after: { filename, hash, size: buffer.length },
                summary: `Audit export generated: ${filename}`,
            },
        })
    );

    return { fileName: pathKey, hash };
}

// ─── Pack Cloning (Retest) ───

export async function clonePackForRetest(
    ctx: RequestContext,
    sourcePackId: string,
    name?: string,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
    assertCanManageAuditPacks(ctx);

    const sourcePack = await runInTenantContext(ctx, (tdb) =>
        tdb.auditPack.findFirst({
            where: { id: sourcePackId, tenantId: ctx.tenantId },
            include: {
                items: { select: { entityType: true, entityId: true, sortOrder: true } },
                cycle: true,
            },
        })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any;
    if (!sourcePack) throw notFound('Source pack not found');
    if (sourcePack.status === 'DRAFT') throw badRequest('Cannot clone a DRAFT pack — freeze first');

    // Create new draft pack
    const clonedPack = await runInTenantContext(ctx, (tdb) =>
        tdb.auditPack.create({
            data: {
                tenantId: ctx.tenantId,
                auditCycleId: sourcePack.auditCycleId,
                name: name || `Retest: ${sourcePack.name}`,
                status: 'DRAFT',
            },
        })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any;

    // Copy item selections (NOT snapshots — new snapshots will be created on freeze)
    const itemsToClone = sourcePack.items
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((i: any) => i.entityType !== 'FILE' && i.entityType !== 'READINESS_REPORT')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((item: any) => ({
            tenantId: ctx.tenantId,
            auditPackId: clonedPack.id,
            entityType: item.entityType,
            entityId: item.entityId,
            sortOrder: item.sortOrder,
            snapshotJson: '',
        }));

    // Auto-include READY_FOR_RETEST issues
    const retestIssues = await runInTenantContext(ctx, (tdb) =>
        tdb.task.findMany({
            where: {
                tenantId: ctx.tenantId,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                status: 'READY_FOR_RETEST' as any,
            },
            select: { id: true },
            take: 50,
        })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any[];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingIssueIds = new Set(itemsToClone.filter((i: any) => i.entityType === 'ISSUE').map((i: any) => i.entityId));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sortOrder = Math.max(...itemsToClone.map((i: any) => i.sortOrder || 0), 0) + 1;

    for (const issue of retestIssues) {
        if (!existingIssueIds.has(issue.id)) {
            itemsToClone.push({
                tenantId: ctx.tenantId,
                auditPackId: clonedPack.id,
                entityType: 'ISSUE',
                entityId: issue.id,
                sortOrder: sortOrder++,
                snapshotJson: '',
            });
        }
    }

    if (itemsToClone.length > 0) {
        await runInTenantContext(ctx, (tdb) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tdb.auditPackItem.createMany({ data: itemsToClone as any[] })
        );
    }

    // Log events
    await runInTenantContext(ctx, (tdb) =>
        logEvent(tdb, ctx, {
            action: 'AUDIT_PACK_CLONED',
            entityType: 'AuditPack',
            entityId: clonedPack.id,
            details: JSON.stringify({
                sourcePackId,
                itemsCopied: itemsToClone.length,
                retestIssuesAdded: retestIssues.filter(i => !existingIssueIds.has(i.id)).length,
            }),
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'AuditPack',
                operation: 'cloned',
                after: {
                    sourcePackId,
                    itemsCopied: itemsToClone.length,
                    retestIssuesAdded: retestIssues.filter(i => !existingIssueIds.has(i.id)).length,
                },
                summary: `Pack cloned from ${sourcePackId}`,
            },
        })
    );

    if (retestIssues.length > 0) {
        await runInTenantContext(ctx, (tdb) =>
            logEvent(tdb, ctx, {
                action: 'RETEST_REQUESTED',
                entityType: 'AuditPack',
                entityId: clonedPack.id,
                details: JSON.stringify({ issueCount: retestIssues.length }),
                detailsJson: {
                    category: 'custom',
                    event: 'retest_requested',
                    issueCount: retestIssues.length,
                },
            })
        );
    }

    return clonedPack;
}

// ─── Auditor Pack Access ───

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getAuditorAssignedPacks(ctx: RequestContext): Promise<any[]> {
    if (ctx.role !== 'AUDITOR') throw forbidden('Only auditors can access this view');

    // Look up user email from userId
    const user = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { email: true } });
    if (!user) return [];

    // Find auditor account for this user
    const auditor = await runInTenantContext(ctx, (tdb) =>
        tdb.auditorAccount.findFirst({
            where: { tenantId: ctx.tenantId, email: user.email, status: 'ACTIVE' },
        })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any;
    if (!auditor) return [];

    // Get pack IDs assigned to this auditor
    const accesses = await runInTenantContext(ctx, (tdb) =>
        tdb.auditorPackAccess.findMany({
            where: { auditorId: auditor.id },
            select: { auditPackId: true },
        })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any[];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const packIds = accesses.map((a: any) => a.auditPackId);
    if (packIds.length === 0) return [];

    // Fetch packs
    const packs = await runInTenantContext(ctx, (tdb) =>
        tdb.auditPack.findMany({
            where: { id: { in: packIds }, tenantId: ctx.tenantId },
            include: {
                cycle: { select: { name: true, frameworkKey: true, frameworkVersion: true } },
                items: { select: { id: true, entityType: true } },
            },
        })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any[];

    return packs;
}
