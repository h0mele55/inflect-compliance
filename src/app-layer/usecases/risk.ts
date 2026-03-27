import { RequestContext } from '../types';
import { RiskRepository, RiskFilters, RiskListParams } from '../repositories/RiskRepository';
import { RiskTemplateRepository } from '../repositories/RiskTemplateRepository';
import { assertCanRead, assertCanWrite, assertCanAdmin } from '../policies/common';
import { logEvent } from '../events/audit';
import { notFound, badRequest } from '@/lib/errors/types';
import { calculateRiskScore } from '@/lib/risk-scoring';
import { runInTenantContext } from '@/lib/db-context';
import type { TreatmentDecision, RiskStatus } from '@prisma/client';

// ─── Tenant-level usecases ───

export async function listRisks(ctx: RequestContext, filters: RiskFilters = {}) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        RiskRepository.list(db, ctx, filters)
    );
}

export async function listRisksPaginated(ctx: RequestContext, params: RiskListParams) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        RiskRepository.listPaginated(db, ctx, params)
    );
}

export async function getRisk(ctx: RequestContext, id: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const risk = await RiskRepository.getById(db, ctx, id);
        if (!risk) throw notFound('Risk not found');
        return risk;
    });
}

export async function createRisk(ctx: RequestContext, data: {
    title: string;
    description?: string | null;
    category?: string | null;
    threat?: string;
    vulnerability?: string;
    impact?: number;
    likelihood?: number;
    treatment?: string | null;
    treatmentOwner?: string | null;
    treatmentNotes?: string | null;
    ownerUserId?: string | null;
    targetDate?: string | null;
    nextReviewAt?: string | null;
}) {
    assertCanWrite(ctx);

    return runInTenantContext(ctx, async (db) => {
        // Tenant lookup is global (Tenant table has no RLS)
        const tenant = await db.tenant.findUnique({ where: { id: ctx.tenantId } });
        const maxScale = tenant?.maxRiskScale || 5;
        const inherentScore = calculateRiskScore(data.likelihood ?? 3, data.impact ?? 3, maxScale);

        const risk = await RiskRepository.create(db, ctx, {
            title: data.title,
            description: data.description || null,
            category: data.category || null,
            threat: data.threat || '',
            vulnerability: data.vulnerability || '',
            impact: data.impact ?? 3,
            likelihood: data.likelihood ?? 3,
            inherentScore,
            score: inherentScore,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma enum boundary
            treatment: (data.treatment || null) as TreatmentDecision | null,
            treatmentOwner: data.treatmentOwner || null,
            treatmentNotes: data.treatmentNotes || null,
            ownerUserId: data.ownerUserId || null,
            createdByUserId: ctx.userId,
            targetDate: data.targetDate ? new Date(data.targetDate) : null,
            nextReviewAt: data.nextReviewAt ? new Date(data.nextReviewAt) : null,
        });

        await logEvent(db, ctx, {
            action: 'CREATE',
            entityType: 'Risk',
            entityId: risk.id,
            details: `Created risk: ${risk.title} (score: ${inherentScore})`,
            detailsJson: { category: 'custom', event: 'create' },
        });

        return risk;
    });
}

interface RiskCreateInput {
    title: string;
    description?: string | null;
    category?: string | null;
    threat?: string;
    vulnerability?: string;
    impact?: number;
    likelihood?: number;
    treatment?: string | null;
    treatmentOwner?: string | null;
    treatmentNotes?: string | null;
    ownerUserId?: string | null;
    status?: string;
    targetDate?: string | null;
    nextReviewAt?: string | null;
}

export async function createRiskFromTemplate(ctx: RequestContext, templateId: string, overrides: Partial<RiskCreateInput> = {}) {
    assertCanWrite(ctx);

    const template = await RiskTemplateRepository.getById(templateId);
    if (!template) throw notFound('Risk template not found');

    return runInTenantContext(ctx, async (db) => {
        const tenant = await db.tenant.findUnique({ where: { id: ctx.tenantId } });
        const maxScale = tenant?.maxRiskScale || 5;
        const likelihood = overrides.likelihood ?? template.defaultLikelihood;
        const impact = overrides.impact ?? template.defaultImpact;
        const score = calculateRiskScore(likelihood, impact, maxScale);

        const risk = await RiskRepository.create(db, ctx, {
            title: overrides.title ?? template.title,
            description: overrides.description ?? template.description ?? null,
            category: overrides.category ?? template.category ?? null,
            likelihood,
            impact,
            score,
            inherentScore: score,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma enum boundary
            status: (overrides.status || 'OPEN') as RiskStatus,
            ownerUserId: overrides.ownerUserId || null,
            createdByUserId: ctx.userId,
            targetDate: overrides.targetDate ? new Date(overrides.targetDate) : null,
            nextReviewAt: overrides.nextReviewAt ? new Date(overrides.nextReviewAt) : null,
        });

        await logEvent(db, ctx, {
            action: 'CREATE',
            entityType: 'Risk',
            entityId: risk.id,
            details: `Created risk from template: ${risk.title} (score: ${score})`,
            detailsJson: { category: 'custom', event: 'create' },
        });

        return risk;
    });
}

export async function updateRisk(ctx: RequestContext, id: string, data: {
    title?: string;
    description?: string | null;
    category?: string | null;
    threat?: string;
    vulnerability?: string;
    impact?: number;
    likelihood?: number;
    treatment?: string | null;
    treatmentOwner?: string | null;
    treatmentNotes?: string | null;
    ownerUserId?: string | null;
    status?: string;
    targetDate?: string | null;
    nextReviewAt?: string | null;
}) {
    assertCanWrite(ctx);

    return runInTenantContext(ctx, async (db) => {
        // Tenant lookup is global (Tenant table has no RLS)
        const tenant = await db.tenant.findUnique({ where: { id: ctx.tenantId } });
        const maxScale = tenant?.maxRiskScale || 5;
        const inherentScore = data.likelihood && data.impact
            ? calculateRiskScore(data.likelihood, data.impact, maxScale)
            : undefined;

        const risk = await RiskRepository.update(db, ctx, id, {
            title: data.title,
            description: data.description,
            category: data.category,
            threat: data.threat,
            vulnerability: data.vulnerability,
            impact: data.impact,
            likelihood: data.likelihood,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma enum boundary
            treatment: data.treatment as TreatmentDecision | undefined,
            treatmentOwner: data.treatmentOwner,
            treatmentNotes: data.treatmentNotes,
            targetDate: data.targetDate ? new Date(data.targetDate) : undefined,
            nextReviewAt: data.nextReviewAt ? new Date(data.nextReviewAt) : undefined,
            inherentScore,
            score: inherentScore,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma enum boundary
            status: data.status as RiskStatus | undefined,
        });

        if (!risk) throw notFound('Risk not found');

        await logEvent(db, ctx, {
            action: 'UPDATE',
            entityType: 'Risk',
            entityId: id,
            details: JSON.stringify(data),
            detailsJson: { category: 'custom', event: 'update' },
        });

        return risk;
    });
}

export async function deleteRisk(ctx: RequestContext, id: string) {
    assertCanAdmin(ctx);

    return runInTenantContext(ctx, async (db) => {
        const deleted = await RiskRepository.delete(db, ctx, id);
        if (!deleted) throw notFound('Risk not found');

        await logEvent(db, ctx, {
            action: 'SOFT_DELETE',
            entityType: 'Risk',
            entityId: id,
            details: 'Risk soft-deleted',
            detailsJson: { category: 'entity_lifecycle', entityName: 'Risk', operation: 'deleted', summary: 'SOFT_DELETE' },
        });

        return { success: true };
    });
}

// ─── Restore / Purge / Include Deleted ───

import { restoreEntity, purgeEntity } from './soft-delete-operations';
import { withDeleted } from '@/lib/soft-delete';

export async function restoreRisk(ctx: RequestContext, id: string) {
    return restoreEntity(ctx, 'Risk', id);
}

export async function purgeRisk(ctx: RequestContext, id: string) {
    return purgeEntity(ctx, 'Risk', id);
}

export async function listRisksWithDeleted(ctx: RequestContext) {
    assertCanAdmin(ctx);
    return runInTenantContext(ctx, (db) =>
        db.risk.findMany(withDeleted({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: 'desc' as const } }))
    );
}

export async function linkControlToRisk(ctx: RequestContext, riskId: string, controlId: string) {
    assertCanWrite(ctx);

    return runInTenantContext(ctx, async (db) => {
        const rc = await RiskRepository.linkControl(db, ctx, riskId, controlId);
        if (!rc) throw notFound('Risk not found');

        await logEvent(db, ctx, {
            action: 'CREATE',
            entityType: 'RiskControl',
            entityId: rc.id,
            details: `Mapped control ${controlId} to risk ${riskId}`,
            detailsJson: { category: 'custom', event: 'create' },
        });

        return rc;
    });
}

