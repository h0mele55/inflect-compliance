import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';

export class PolicyApprovalRepository {
    static async request(db: PrismaTx, ctx: RequestContext, policyId: string, versionId: string) {
        return db.policyApproval.create({
            data: {
                tenantId: ctx.tenantId,
                policyId,
                policyVersionId: versionId,
                requestedByUserId: ctx.userId,
                status: 'PENDING',
            },
            include: {
                requestedBy: { select: { id: true, name: true } },
                policyVersion: { select: { versionNumber: true } },
            },
        });
    }

    static async decide(db: PrismaTx, ctx: RequestContext, approvalId: string, decision: 'APPROVED' | 'REJECTED', comment?: string) {
        // updateMany so the WHERE can carry the tenantId defence-in-depth
        // filter (Prisma `update` only accepts unique fields in `where`).
        await db.policyApproval.updateMany({
            where: { id: approvalId, tenantId: ctx.tenantId },
            data: {
                status: decision,
                approvedByUserId: ctx.userId,
                decidedAt: new Date(),
                comment,
            },
        });
        return db.policyApproval.findFirst({
            where: { id: approvalId, tenantId: ctx.tenantId },
            include: {
                policy: { select: { id: true, tenantId: true, title: true } },
                policyVersion: { select: { versionNumber: true } },
                requestedBy: { select: { id: true, name: true } },
                approvedBy: { select: { id: true, name: true } },
            },
        });
    }

    static async getById(db: PrismaTx, ctx: RequestContext, id: string) {
        return db.policyApproval.findFirst({
            where: { id, tenantId: ctx.tenantId },
            include: {
                policy: { select: { id: true, tenantId: true, title: true } },
                policyVersion: { select: { versionNumber: true } },
            },
        });
    }

    static async listPending(db: PrismaTx, ctx: RequestContext) {
        return db.policyApproval.findMany({
            where: {
                tenantId: ctx.tenantId,
                status: 'PENDING',
            },
            orderBy: { createdAt: 'desc' },
            include: {
                policy: { select: { id: true, title: true, slug: true } },
                policyVersion: { select: { versionNumber: true } },
                requestedBy: { select: { id: true, name: true } },
            },
        });
    }
}
