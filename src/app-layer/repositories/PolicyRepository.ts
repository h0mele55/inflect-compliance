import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';

export class PolicyRepository {
    static async list(db: PrismaTx, ctx: RequestContext, filters?: { status?: string; category?: string; q?: string }) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const where: any = { tenantId: ctx.tenantId };
        if (filters?.status) where.status = filters.status;
        if (filters?.category) where.category = filters.category;
        if (filters?.q) {
            where.OR = [
                { title: { contains: filters.q, mode: 'insensitive' } },
                { description: { contains: filters.q, mode: 'insensitive' } },
            ];
        }

        return db.policy.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            include: {
                currentVersion: true,
                owner: { select: { id: true, name: true, email: true } },
                _count: { select: { versions: true, controlLinks: true, approvals: true } },
            },
        });
    }

    static async getById(db: PrismaTx, ctx: RequestContext, id: string) {
        return db.policy.findFirst({
            where: { id, tenantId: ctx.tenantId },
            include: {
                currentVersion: {
                    include: {
                        createdBy: { select: { id: true, name: true } },
                    },
                },
                owner: { select: { id: true, name: true, email: true } },
                versions: {
                    orderBy: { versionNumber: 'desc' },
                    include: {
                        createdBy: { select: { id: true, name: true } },
                        approvals: {
                            include: {
                                requestedBy: { select: { id: true, name: true } },
                                approvedBy: { select: { id: true, name: true } },
                            },
                        },
                    },
                },
                controlLinks: {
                    include: {
                        control: { select: { id: true, name: true, annexId: true } },
                    },
                },
            },
        });
    }

    static async getBySlug(db: PrismaTx, ctx: RequestContext, slug: string) {
        return db.policy.findFirst({
            where: { slug, tenantId: ctx.tenantId },
        });
    }

    static async create(db: PrismaTx, ctx: RequestContext, data: {
        slug: string;
        title: string;
        description?: string | null;
        category?: string | null;
        ownerUserId?: string | null;
        reviewFrequencyDays?: number | null;
        nextReviewAt?: Date | null;
        language?: string | null;
    }) {
        return db.policy.create({
            data: {
                tenantId: ctx.tenantId,
                slug: data.slug,
                title: data.title,
                description: data.description,
                category: data.category,
                ownerUserId: data.ownerUserId,
                reviewFrequencyDays: data.reviewFrequencyDays,
                nextReviewAt: data.nextReviewAt,
                language: data.language || 'en',
                status: 'DRAFT',
            },
        });
    }

    static async updateMetadata(db: PrismaTx, ctx: RequestContext, id: string, data: {
        title?: string;
        description?: string | null;
        category?: string | null;
        ownerUserId?: string | null;
        reviewFrequencyDays?: number | null;
        nextReviewAt?: Date | null;
        language?: string | null;
    }) {
        return db.policy.updateMany({
            where: { id, tenantId: ctx.tenantId },
            data,
        });
    }

    static async updateStatus(db: PrismaTx, ctx: RequestContext, id: string, status: string) {
        return db.policy.updateMany({
            where: { id, tenantId: ctx.tenantId },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: { status: status as any },
        });
    }

    static async setCurrentVersion(db: PrismaTx, ctx: RequestContext, id: string, versionId: string | null) {
        return db.policy.updateMany({
            where: { id, tenantId: ctx.tenantId },
            data: { currentVersionId: versionId },
        });
    }
}
