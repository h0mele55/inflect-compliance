import { RequestContext } from '../types';
import { FindingRepository } from '../repositories/FindingRepository';
import { assertCanRead, assertCanWrite } from '../policies/common';
import { logEvent } from '../events/audit';
import { notFound } from '@/lib/errors/types';
import { runInTenantContext } from '@/lib/db-context';
import type { FindingSeverity, FindingType, FindingStatus } from '@prisma/client';

export async function listFindings(ctx: RequestContext) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        FindingRepository.list(db, ctx)
    );
}

export async function getFinding(ctx: RequestContext, id: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const finding = await FindingRepository.getById(db, ctx, id);
        if (!finding) throw notFound('Finding not found');
        return finding;
    });
}

export async function createFinding(ctx: RequestContext, data: {
    auditId?: string | null;
    severity: string;
    type: string;
    title: string;
    description?: string;
    rootCause?: string;
    correctiveAction?: string;
    owner?: string;
    dueDate?: string | null;
}) {
    assertCanWrite(ctx);

    return runInTenantContext(ctx, async (db) => {
        const finding = await FindingRepository.create(db, ctx, {
            auditId: data.auditId || null,
            severity: data.severity as FindingSeverity,
            type: data.type as FindingType,
            title: data.title,
            description: data.description || '',
            rootCause: data.rootCause,
            correctiveAction: data.correctiveAction,
            owner: data.owner,
            dueDate: data.dueDate ? new Date(data.dueDate) : null,
            status: 'OPEN',
        });

        await logEvent(db, ctx, {
            action: 'CREATE',
            entityType: 'Finding',
            entityId: finding.id,
            details: `Created finding: ${finding.title}`,
        });

        return finding;
    });
}

export async function updateFinding(ctx: RequestContext, id: string, data: {
    severity?: string;
    type?: string;
    title?: string;
    description?: string;
    rootCause?: string;
    correctiveAction?: string;
    owner?: string;
    dueDate?: string | null;
    status?: string;
    verificationNotes?: string;
}) {
    assertCanWrite(ctx);

    return runInTenantContext(ctx, async (db) => {
        const oldFinding = await FindingRepository.getById(db, ctx, id);
        if (!oldFinding) throw notFound('Finding not found');

        const finding = await FindingRepository.update(db, ctx, id, {
            severity: data.severity as FindingSeverity | undefined,
            type: data.type as FindingType | undefined,
            title: data.title,
            description: data.description,
            rootCause: data.rootCause,
            correctiveAction: data.correctiveAction,
            owner: data.owner,
            dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
            status: data.status as FindingStatus | undefined,
            verificationNotes: data.verificationNotes,
            verifiedBy: data.status === 'CLOSED' ? ctx.userId : undefined,
            verifiedAt: data.status === 'CLOSED' ? new Date() : undefined,
        });

        if (!finding) throw notFound('Finding not found');

        if (data.status && data.status !== oldFinding.status) {
            await logEvent(db, ctx, {
                action: 'STATUS_CHANGE',
                entityType: 'Finding',
                entityId: id,
                details: `${oldFinding.status} → ${data.status}`,
            });
        } else {
            await logEvent(db, ctx, {
                action: 'UPDATE',
                entityType: 'Finding',
                entityId: id,
                details: JSON.stringify(data),
            });
        }

        return finding;
    });
}
