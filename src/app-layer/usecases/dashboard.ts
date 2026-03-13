import { RequestContext } from '../types';
import { DashboardRepository } from '../repositories/DashboardRepository';
import { assertCanRead } from '../policies/common';
import { runInTenantContext } from '@/lib/db-context';

export async function getDashboardData(ctx: RequestContext) {
    assertCanRead(ctx);

    return runInTenantContext(ctx, async (db) => {
        const stats = await DashboardRepository.getStats(db, ctx);
        const recentActivity = await DashboardRepository.getRecentActivity(db, ctx);

        return {
            stats,
            recentActivity,
        };
    });
}
