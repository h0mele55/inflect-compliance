/**
 * Epic G-7 — RiskTreatmentPlan + TreatmentMilestone repository.
 *
 * Every query filters by `tenantId` (defence in depth — RLS already
 * enforces isolation, but the explicit predicate keeps query plans
 * readable and error messages clear when the app layer is correct).
 */
import { Prisma } from '@prisma/client';
import type {
    TreatmentPlanStatus,
    TreatmentStrategy,
} from '@prisma/client';
import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';

const planListSelect = {
    id: true,
    tenantId: true,
    riskId: true,
    strategy: true,
    ownerUserId: true,
    targetDate: true,
    status: true,
    completedAt: true,
    createdAt: true,
    risk: { select: { id: true, title: true, status: true } },
    _count: { select: { milestones: true } },
} as const;

const planDetailInclude = {
    risk: { select: { id: true, title: true, status: true } },
    owner: { select: { id: true, email: true, name: true } },
    createdBy: { select: { id: true, email: true, name: true } },
    completedBy: { select: { id: true, email: true, name: true } },
    milestones: {
        orderBy: [{ sortOrder: 'asc' }],
        include: {
            completedBy: { select: { id: true, email: true, name: true } },
        },
    },
} as const satisfies Prisma.RiskTreatmentPlanInclude;

export class RiskTreatmentPlanRepository {
    static async list(
        db: PrismaTx,
        ctx: RequestContext,
        options: {
            take?: number;
            status?: TreatmentPlanStatus;
            riskId?: string;
            includeDeleted?: boolean;
        } = {},
    ) {
        return db.riskTreatmentPlan.findMany({
            where: {
                tenantId: ctx.tenantId,
                ...(options.includeDeleted ? {} : { deletedAt: null }),
                ...(options.status ? { status: options.status } : {}),
                ...(options.riskId ? { riskId: options.riskId } : {}),
            },
            orderBy: { createdAt: 'desc' },
            select: planListSelect,
            ...(options.take ? { take: options.take } : {}),
        });
    }

    static async getById(db: PrismaTx, ctx: RequestContext, id: string) {
        return db.riskTreatmentPlan.findFirst({
            where: { id, tenantId: ctx.tenantId, deletedAt: null },
            include: planDetailInclude,
        });
    }

    static async create(
        db: PrismaTx,
        ctx: RequestContext,
        data: {
            riskId: string;
            strategy: TreatmentStrategy;
            ownerUserId: string;
            targetDate: Date;
        },
    ) {
        return db.riskTreatmentPlan.create({
            data: {
                tenantId: ctx.tenantId,
                riskId: data.riskId,
                strategy: data.strategy,
                ownerUserId: data.ownerUserId,
                targetDate: data.targetDate,
                createdByUserId: ctx.userId,
            },
            select: planListSelect,
        });
    }

    /**
     * Atomic plan-completion update — keyed on the prior status so
     * a concurrent transition (e.g. monitor flipping to OVERDUE) can
     * never silently overwrite a user-driven complete. Returns the
     * count for caller-side concurrency checks.
     */
    static async markCompleted(
        db: PrismaTx,
        ctx: RequestContext,
        id: string,
        completedAt: Date,
        closingRemark: string,
    ): Promise<number> {
        const r = await db.riskTreatmentPlan.updateMany({
            where: {
                id,
                tenantId: ctx.tenantId,
                deletedAt: null,
                status: { in: ['DRAFT', 'ACTIVE', 'OVERDUE'] },
            },
            data: {
                status: 'COMPLETED',
                completedAt,
                completedByUserId: ctx.userId,
                closingRemark,
            },
        });
        return r.count;
    }

    /**
     * Mark a plan OVERDUE — used by the daily monitor job. Only acts
     * on non-completed, non-deleted plans whose `targetDate` is in
     * the past. Idempotent.
     */
    static async markOverdue(
        db: PrismaTx,
        ctx: RequestContext,
        id: string,
        now: Date,
    ): Promise<number> {
        const r = await db.riskTreatmentPlan.updateMany({
            where: {
                id,
                tenantId: ctx.tenantId,
                status: { in: ['DRAFT', 'ACTIVE'] },
                deletedAt: null,
                targetDate: { lt: now },
            },
            data: { status: 'OVERDUE' },
        });
        return r.count;
    }

    /**
     * Auto-activate transition — DRAFT plans become ACTIVE the moment
     * actual work starts (canonical trigger: first milestone added).
     * Atomic on the prior status so a concurrent flip elsewhere
     * doesn't get clobbered.
     */
    static async markActiveFromDraft(
        db: PrismaTx,
        ctx: RequestContext,
        id: string,
    ): Promise<number> {
        const r = await db.riskTreatmentPlan.updateMany({
            where: {
                id,
                tenantId: ctx.tenantId,
                status: 'DRAFT',
                deletedAt: null,
            },
            data: { status: 'ACTIVE' },
        });
        return r.count;
    }

    /**
     * Strategy change — `updateMany` scoped by tenantId so a stale
     * id from another tenant cannot mutate a foreign row even if
     * RLS were bypassed somehow upstream. COMPLETED + deleted rows
     * are excluded.
     */
    static async updateStrategy(
        db: PrismaTx,
        ctx: RequestContext,
        id: string,
        strategy: TreatmentStrategy,
    ): Promise<number> {
        const r = await db.riskTreatmentPlan.updateMany({
            where: {
                id,
                tenantId: ctx.tenantId,
                deletedAt: null,
                status: { not: 'COMPLETED' },
            },
            data: { strategy },
        });
        return r.count;
    }

    /** Count milestones — used to compute next sortOrder on append. */
    static async countMilestones(
        db: PrismaTx,
        ctx: RequestContext,
        treatmentPlanId: string,
    ): Promise<number> {
        return db.treatmentMilestone.count({
            where: { treatmentPlanId, tenantId: ctx.tenantId },
        });
    }

    static async addMilestone(
        db: PrismaTx,
        ctx: RequestContext,
        data: {
            treatmentPlanId: string;
            title: string;
            description?: string | null;
            dueDate: Date;
            sortOrder: number;
            evidence?: string | null;
        },
    ) {
        return db.treatmentMilestone.create({
            data: {
                tenantId: ctx.tenantId,
                treatmentPlanId: data.treatmentPlanId,
                title: data.title,
                description: data.description ?? null,
                dueDate: data.dueDate,
                sortOrder: data.sortOrder,
                evidence: data.evidence ?? null,
            },
        });
    }

    static async getMilestone(
        db: PrismaTx,
        ctx: RequestContext,
        id: string,
    ) {
        return db.treatmentMilestone.findFirst({
            where: { id, tenantId: ctx.tenantId },
            include: {
                treatmentPlan: {
                    select: {
                        id: true,
                        tenantId: true,
                        status: true,
                        deletedAt: true,
                    },
                },
            },
        });
    }

    static async markMilestoneCompleted(
        db: PrismaTx,
        ctx: RequestContext,
        id: string,
        completedAt: Date,
        evidence?: string | null,
    ): Promise<number> {
        const r = await db.treatmentMilestone.updateMany({
            where: {
                id,
                tenantId: ctx.tenantId,
                completedAt: null,
            },
            data: {
                completedAt,
                completedByUserId: ctx.userId,
                ...(evidence !== undefined ? { evidence } : {}),
            },
        });
        return r.count;
    }

    /**
     * Find treatment plans whose targetDate has elapsed AND status
     * is not COMPLETED. `tenantId` optional so the system-wide
     * monitor job can scan every tenant in one pass. Tenant-scoped
     * dashboards pass `ctx.tenantId`.
     */
    static async findOverdue(
        db: PrismaTx,
        opts: { now: Date; tenantId?: string },
    ) {
        return db.riskTreatmentPlan.findMany({
            where: {
                deletedAt: null,
                status: { in: ['DRAFT', 'ACTIVE', 'OVERDUE'] },
                targetDate: { lt: opts.now },
                ...(opts.tenantId ? { tenantId: opts.tenantId } : {}),
            },
            orderBy: { targetDate: 'asc' },
            select: {
                id: true,
                tenantId: true,
                riskId: true,
                strategy: true,
                ownerUserId: true,
                status: true,
                targetDate: true,
                createdAt: true,
                risk: { select: { id: true, title: true } },
            },
        });
    }
}
