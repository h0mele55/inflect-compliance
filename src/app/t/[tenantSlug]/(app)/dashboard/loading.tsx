import {
    Skeleton,
    SkeletonLine,
    SkeletonHeading,
    SkeletonCard,
} from '@/components/ui/skeleton';

/**
 * Dashboard loading skeleton — metric cards + chart + table.
 */
export default function DashboardLoading() {
    return (
        <div className="space-y-6 animate-fadeIn" aria-busy="true" aria-label="Loading dashboard">
            {/* Title */}
            <SkeletonHeading className="w-56" />

            {/* Metric cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="glass-card p-4 space-y-3">
                        <SkeletonLine className="w-24" />
                        <Skeleton className="h-8 w-16" />
                    </div>
                ))}
            </div>

            {/* Chart area */}
            <div className="glass-card p-6 space-y-4">
                <SkeletonLine className="w-40" />
                <Skeleton className="h-48 w-full" />
            </div>

            {/* Recent activity table */}
            <SkeletonCard lines={4} />
        </div>
    );
}
