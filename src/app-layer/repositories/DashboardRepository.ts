import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';

export class DashboardRepository {
    static async getStats(db: PrismaTx, ctx: RequestContext) {
        const tenantId = ctx.tenantId;

        const [assetCount, riskCount, controlCount, evidenceCount, taskCount, findingCount] = await Promise.all([
            db.asset.count({ where: { tenantId } }),
            db.risk.count({ where: { tenantId } }),
            db.control.count({ where: { OR: [{ tenantId }, { tenantId: null }] } }),
            db.evidence.count({ where: { tenantId } }),
            db.task.count({ where: { tenantId, status: { notIn: ['RESOLVED', 'CLOSED', 'CANCELED'] } } }),
            db.finding.count({ where: { tenantId, status: { not: 'CLOSED' } } }),
        ]);

        const highRisks = await db.risk.count({ where: { tenantId, inherentScore: { gte: 15 } } });
        const pendingEvidence = await db.evidence.count({ where: { tenantId, status: 'SUBMITTED' } });
        const overdueEvidence = await db.evidence.count({
            where: { tenantId, nextReviewDate: { lt: new Date() }, status: { not: 'APPROVED' } },
        });

        const clauseProgress = await db.clauseProgress.findMany({ where: { tenantId } });
        const clausesReady = clauseProgress.filter((p) => p.status === 'READY').length;

        const unreadNotifications = await db.notification.count({
            where: { tenantId, userId: ctx.userId, read: false },
        });

        return {
            assets: assetCount,
            risks: riskCount,
            controls: controlCount,
            evidence: evidenceCount,
            openTasks: taskCount,
            openFindings: findingCount,
            highRisks,
            pendingEvidence,
            overdueEvidence,
            clausesReady,
            totalClauses: 7,
            unreadNotifications,
        };
    }

    static async getRecentActivity(db: PrismaTx, ctx: RequestContext) {
        return db.auditLog.findMany({
            where: { tenantId: ctx.tenantId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: { user: { select: { name: true } } },
        });
    }
}
