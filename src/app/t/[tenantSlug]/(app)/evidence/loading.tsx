import {
    SkeletonPageHeader,
    SkeletonFilterBar,
    SkeletonDataTable,
} from '@/components/ui/skeleton';

/**
 * Evidence loading skeleton — header + filters + card list.
 */
export default function EvidenceLoading() {
    return (
        <div className="space-y-6 animate-fadeIn" aria-busy="true" aria-label="Loading evidence">
            <SkeletonPageHeader />
            <SkeletonFilterBar />
            <SkeletonDataTable rows={8} cols={6} />
        </div>
    );
}
