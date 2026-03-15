import {
    SkeletonPageHeader,
    SkeletonDataTable,
} from '@/components/ui/skeleton';

/**
 * Assets loading skeleton — header + table.
 */
export default function AssetsLoading() {
    return (
        <div className="space-y-6 animate-fadeIn" aria-busy="true" aria-label="Loading assets">
            <SkeletonPageHeader />
            <SkeletonDataTable rows={8} cols={6} />
        </div>
    );
}
