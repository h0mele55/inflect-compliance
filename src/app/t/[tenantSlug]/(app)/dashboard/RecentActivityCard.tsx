import { getTenantCtx } from '@/app-layer/context';
import { runInTenantContext } from '@/lib/db-context';
import { DashboardRepository } from '@/app-layer/repositories/DashboardRepository';

interface RecentActivityCardProps {
    tenantSlug: string;
    label: string;
    noActivityLabel: string;
}

/**
 * Async server component that independently fetches and renders recent activity.
 * Designed to be wrapped in <Suspense> so the rest of the dashboard streams immediately
 * while this potentially slower query completes.
 */
export default async function RecentActivityCard({
    tenantSlug,
    label,
    noActivityLabel,
}: RecentActivityCardProps) {
    const ctx = await getTenantCtx({ tenantSlug });

    const recentActivity = await runInTenantContext(ctx, async (db) => {
        return DashboardRepository.getRecentActivity(db, ctx);
    });

    return (
        <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">{label}</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {recentActivity.map((log: any) => (
                    <div key={log.id} className="flex flex-col sm:flex-row items-start gap-1 sm:gap-2 text-xs">
                        <span className="text-slate-500 whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</span>
                        <span className="text-slate-400">
                            <span className="text-slate-300 font-medium">{log.user?.name}</span>{' '}
                            {log.action.toLowerCase()} {log.entity.toLowerCase()}
                        </span>
                    </div>
                ))}
                {recentActivity.length === 0 && <p className="text-slate-500 text-xs">{noActivityLabel}</p>}
            </div>
        </div>
    );
}
