import {
    SkeletonPageHeader,
    SkeletonFilterBar,
    SkeletonDataTable,
} from '@/components/ui/skeleton';

/**
 * Tasks loading skeleton — header + filters + 8-col table.
 */
export default function TasksLoading() {
    return (
        <div className="space-y-6 animate-fadeIn" aria-busy="true" aria-label="Loading tasks">
            <SkeletonPageHeader />
            <SkeletonFilterBar />
            <SkeletonDataTable rows={10} cols={8} />
        </div>
    );
}
