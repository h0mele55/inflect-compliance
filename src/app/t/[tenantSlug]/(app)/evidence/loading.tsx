import {
    SkeletonPageHeader,
    SkeletonCompactFilterBar,
    SkeletonDataTable,
} from '@/components/ui/skeleton';

/**
 * Evidence loading skeleton — header + compact filter bar + 7-col table.
 */
export default function EvidenceLoading() {
    return (
        <div className="space-y-6 animate-fadeIn" aria-busy="true" aria-label="Loading evidence">
            <SkeletonPageHeader />
            <SkeletonCompactFilterBar />
            <SkeletonDataTable rows={8} cols={7} />
        </div>
    );
}
