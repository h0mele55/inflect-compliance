import {
    SkeletonPageHeader,
    SkeletonFilterBar,
    SkeletonDataTable,
} from '@/components/ui/skeleton';

/**
 * Vendors loading skeleton — header + filters + 7-col table.
 */
export default function VendorsLoading() {
    return (
        <div className="space-y-6 animate-fadeIn" aria-busy="true" aria-label="Loading vendors">
            <SkeletonPageHeader />
            <SkeletonFilterBar />
            <SkeletonDataTable rows={8} cols={7} />
        </div>
    );
}
