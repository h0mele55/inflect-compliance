import {
    SkeletonPageHeader,
    SkeletonCompactFilterBar,
    SkeletonDataTable,
} from '@/components/ui/skeleton';

/**
 * Vendors loading skeleton — header + compact filter bar + 7-col table.
 */
export default function VendorsLoading() {
    return (
        <div className="space-y-6 animate-fadeIn" aria-busy="true" aria-label="Loading vendors">
            <SkeletonPageHeader />
            <SkeletonCompactFilterBar />
            <SkeletonDataTable rows={8} cols={7} />
        </div>
    );
}
