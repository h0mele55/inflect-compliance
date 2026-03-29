import { SkeletonDashboard } from '@/components/ui/skeleton';

/**
 * Route-level loading.tsx for /t/[tenantSlug]/dashboard.
 *
 * Mirrors the real dashboard layout: 6-card stat grid, clause progress bar,
 * compliance alerts, quick actions, and activity feed.
 * Streams the shell instantly while server-side data fetching completes.
 */
export default function DashboardLoading() {
    return <SkeletonDashboard />;
}
