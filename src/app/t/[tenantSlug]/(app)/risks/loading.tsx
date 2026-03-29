import {
    SkeletonPageHeader,
    SkeletonKpiGrid,
    SkeletonCompactFilterBar,
    SkeletonDataTable,
} from '@/components/ui/skeleton';

/**
 * Risks loading skeleton — header + 4 KPI cards + filter bar + 8-col table.
 * Matches the real RisksClient layout for seamless streaming.
 */
export default function RisksLoading() {
    return (
        <div className="space-y-6 animate-fadeIn" aria-busy="true" aria-label="Loading risks">
            <SkeletonPageHeader />
            <SkeletonKpiGrid count={4} />
            <SkeletonCompactFilterBar />
            <SkeletonDataTable rows={8} cols={8} />
        </div>
    );
}
