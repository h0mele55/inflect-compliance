import {
    SkeletonPageHeader,
    SkeletonCompactFilterBar,
    SkeletonDataTable,
} from '@/components/ui/skeleton';

/**
 * Policies loading skeleton — header + compact filter bar + 6-col table.
 */
export default function PoliciesLoading() {
    return (
        <div className="space-y-6 animate-fadeIn" aria-busy="true" aria-label="Loading policies">
            <SkeletonPageHeader />
            <SkeletonCompactFilterBar />
            <SkeletonDataTable rows={8} cols={6} />
        </div>
    );
}
