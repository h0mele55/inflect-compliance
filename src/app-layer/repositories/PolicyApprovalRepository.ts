import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';

export class PolicyApprovalRepository {
    static async request(db: PrismaTx, ctx: RequestContext, policyId: string, versionId: string) {
        return db.policyApproval.create({
            data: {
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
        return db.policyApproval.update({
            where: { id: approvalId },
            data: {
                status: decision,
                approvedByUserId: ctx.userId,
                decidedAt: new Date(),
                comment,
            },
            include: {
                policy: { select: { id: true, tenantId: true, title: true } },
                policyVersion: { select: { versionNumber: true } },
                requestedBy: { select: { id: true, name: true } },
                approvedBy: { select: { id: true, name: true } },
            },
        });
    }

    static async getById(db: PrismaTx, id: string) {
        return db.policyApproval.findUnique({
            where: { id },
            include: {
                policy: { select: { id: true, tenantId: true, title: true } },
                policyVersion: { select: { versionNumber: true } },
            },
        });
    }

    static async listPending(db: PrismaTx, ctx: RequestContext) {
        return db.policyApproval.findMany({
            where: {
                policy: { tenantId: ctx.tenantId },
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
