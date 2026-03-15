import {
    SkeletonPageHeader,
    SkeletonFilterBar,
    SkeletonDataTable,
} from '@/components/ui/skeleton';

/**
 * Policies loading skeleton — header + filters + 6-col table.
 */
export default function PoliciesLoading() {
    return (
        <div className="space-y-6 animate-fadeIn" aria-busy="true" aria-label="Loading policies">
            <SkeletonPageHeader />
            <SkeletonFilterBar />
            <SkeletonDataTable rows={8} cols={6} />
        </div>
    );
}
