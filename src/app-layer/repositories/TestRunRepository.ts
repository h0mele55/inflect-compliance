/**
 * Test Run repository — CRUD operations for ControlTestRun.
 */
import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';

export const TestRunRepository = {
    async create(db: PrismaTx, ctx: RequestContext, data: {
        testPlanId: string;
        controlId: string;
    }) {
        return db.controlTestRun.create({
            data: {
                tenantId: ctx.tenantId,
                controlId: data.controlId,
                testPlanId: data.testPlanId,
                status: 'PLANNED',
                createdByUserId: ctx.userId,
                requestId: ctx.requestId,
            },
        });
    },

    async getById(db: PrismaTx, ctx: RequestContext, runId: string) {
        return db.controlTestRun.findFirst({
            where: { id: runId, tenantId: ctx.tenantId },
            include: {
                testPlan: { select: { id: true, name: true, controlId: true, frequency: true, ownerUserId: true } },
                executedBy: { select: { id: true, name: true, email: true } },
                createdBy: { select: { id: true, name: true, email: true } },
                evidence: {
                    include: {
                        evidence: { select: { id: true, title: true, type: true } },
                        createdBy: { select: { id: true, name: true, email: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                },
            },
        });
    },

    async listByPlan(db: PrismaTx, ctx: RequestContext, testPlanId: string) {
        return db.controlTestRun.findMany({
            where: { tenantId: ctx.tenantId, testPlanId },
            include: {
                executedBy: { select: { id: true, name: true, email: true } },
                _count: { select: { evidence: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    },

    async complete(db: PrismaTx, ctx: RequestContext, runId: string, data: {
        result: 'PASS' | 'FAIL' | 'INCONCLUSIVE';
        notes?: string | null;
        findingSummary?: string | null;
    }) {
        return db.controlTestRun.update({
            where: { id: runId },
            data: {
                status: 'COMPLETED',
                result: data.result,
                executedAt: new Date(),
                executedByUserId: ctx.userId,
                notes: data.notes ?? null,
                findingSummary: data.findingSummary ?? null,
            },
        });
    },
};
