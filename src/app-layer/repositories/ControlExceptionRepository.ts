/**
 * Epic G-5 — ControlException repository.
 *
 * Every query filters by `tenantId` (defence in depth — RLS already
 * enforces isolation, but the explicit predicate keeps query plans
 * readable and error messages clear when the app layer is correct).
 */
import { Prisma } from '@prisma/client';
import type { ControlExceptionStatus } from '@prisma/client';
import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';

const exceptionListSelect = {
    id: true,
    tenantId: true,
    controlId: true,
    status: true,
    expiresAt: true,
    approvedAt: true,
    rejectedAt: true,
    riskAcceptedByUserId: true,
    createdByUserId: true,
    createdAt: true,
    renewedFromId: true,
    compensatingControlId: true,
    control: { select: { id: true, name: true, code: true } },
    compensatingControl: { select: { id: true, name: true, code: true } },
} as const;

const exceptionDetailInclude = {
    control: { select: { id: true, name: true, code: true } },
    compensatingControl: { select: { id: true, name: true, code: true } },
    riskAcceptedBy: { select: { id: true, email: true, name: true } },
    createdBy: { select: { id: true, email: true, name: true } },
    approvedBy: { select: { id: true, email: true, name: true } },
    rejectedBy: { select: { id: true, email: true, name: true } },
    renewedFrom: {
        select: {
            id: true,
            status: true,
            expiresAt: true,
            approvedAt: true,
        },
    },
    renewals: {
        select: {
            id: true,
            status: true,
            createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
    },
} as const satisfies Prisma.ControlExceptionInclude;

export class ControlExceptionRepository {
    static async list(
        db: PrismaTx,
        ctx: RequestContext,
        options: {
            take?: number;
            status?: ControlExceptionStatus;
            controlId?: string;
            includeDeleted?: boolean;
        } = {},
    ) {
        return db.controlException.findMany({
            where: {
                tenantId: ctx.tenantId,
                ...(options.includeDeleted ? {} : { deletedAt: null }),
                ...(options.status ? { status: options.status } : {}),
                ...(options.controlId ? { controlId: options.controlId } : {}),
            },
            orderBy: { createdAt: 'desc' },
            select: exceptionListSelect,
            ...(options.take ? { take: options.take } : {}),
        });
    }

    static async getById(db: PrismaTx, ctx: RequestContext, id: string) {
        return db.controlException.findFirst({
            where: { id, tenantId: ctx.tenantId, deletedAt: null },
            include: exceptionDetailInclude,
        });
    }

    static async create(
        db: PrismaTx,
        ctx: RequestContext,
        data: {
            controlId: string;
            justification: string;
            compensatingControlId?: string | null;
            riskAcceptedByUserId: string;
            expiresAt?: Date | null;
            renewedFromId?: string | null;
        },
    ) {
        return db.controlException.create({
            data: {
                tenantId: ctx.tenantId,
                controlId: data.controlId,
                justification: data.justification,
                compensatingControlId: data.compensatingControlId ?? null,
                riskAcceptedByUserId: data.riskAcceptedByUserId,
                expiresAt: data.expiresAt ?? null,
                renewedFromId: data.renewedFromId ?? null,
                createdByUserId: ctx.userId,
            },
            select: exceptionListSelect,
        });
    }

    /**
     * Approve a row — single transactional update that satisfies the
     * `_approval_shape` CHECK (approver triple all-or-nothing).
     * `updateMany` scoped by id + tenantId + status='REQUESTED' so a
     * concurrent reject can't be silently overwritten.
     */
    static async approve(
        db: PrismaTx,
        ctx: RequestContext,
        id: string,
        approvedAt: Date,
        expiresAt: Date,
    ): Promise<number> {
        const r = await db.controlException.updateMany({
            where: {
                id,
                tenantId: ctx.tenantId,
                status: 'REQUESTED',
                deletedAt: null,
            },
            data: {
                status: 'APPROVED',
                approvedAt,
                approvedByUserId: ctx.userId,
                expiresAt,
            },
        });
        return r.count;
    }

    static async reject(
        db: PrismaTx,
        ctx: RequestContext,
        id: string,
        rejectedAt: Date,
        reason: string,
    ): Promise<number> {
        const r = await db.controlException.updateMany({
            where: {
                id,
                tenantId: ctx.tenantId,
                status: 'REQUESTED',
                deletedAt: null,
            },
            data: {
                status: 'REJECTED',
                rejectedAt,
                rejectedByUserId: ctx.userId,
                rejectionReason: reason,
            },
        });
        return r.count;
    }

    /**
     * Mark a row EXPIRED. Used by the expiry job — never by the user
     * paths (which never touch this state directly). Only acts on
     * APPROVED rows whose `expiresAt` is in the past; idempotent.
     */
    static async markExpired(
        db: PrismaTx,
        ctx: RequestContext,
        id: string,
    ): Promise<number> {
        const r = await db.controlException.updateMany({
            where: {
                id,
                tenantId: ctx.tenantId,
                status: 'APPROVED',
                expiresAt: { lte: new Date() },
                deletedAt: null,
            },
            data: { status: 'EXPIRED' },
        });
        return r.count;
    }

    /**
     * Find approved exceptions whose `expiresAt` falls within the
     * supplied lookahead window. Ordered ascending by expiry so the
     * dashboard / job can surface "soonest first".
     *
     * `tenantId` is OPTIONAL here — the job uses the system-wide
     * call (no tenantId) so it can scan every tenant in one pass;
     * the dashboard usecase passes ctx.tenantId for a scoped read.
     */
    static async findExpiringWithin(
        db: PrismaTx,
        opts: {
            now: Date;
            days: number;
            tenantId?: string;
        },
    ) {
        const cutoff = new Date(
            opts.now.getTime() + opts.days * 24 * 60 * 60 * 1000,
        );
        return db.controlException.findMany({
            where: {
                status: 'APPROVED',
                deletedAt: null,
                expiresAt: { not: null, gte: opts.now, lte: cutoff },
                ...(opts.tenantId ? { tenantId: opts.tenantId } : {}),
            },
            orderBy: { expiresAt: 'asc' },
            select: {
                id: true,
                tenantId: true,
                controlId: true,
                expiresAt: true,
                approvedByUserId: true,
                riskAcceptedByUserId: true,
                createdByUserId: true,
                control: { select: { id: true, name: true, code: true } },
            },
        });
    }
}
