import {
    SkeletonPageHeader,
    SkeletonDataTable,
} from '@/components/ui/skeleton';

/**
 * Risks loading skeleton — header + 8-col table.
 */
export default function RisksLoading() {
    return (
        <div className="space-y-6 animate-fadeIn" aria-busy="true" aria-label="Loading risks">
            <SkeletonPageHeader />
            <SkeletonDataTable rows={8} cols={8} />
        </div>
    );
}
