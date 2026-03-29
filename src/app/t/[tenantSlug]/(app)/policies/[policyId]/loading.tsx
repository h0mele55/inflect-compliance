import { SkeletonDetailTabs } from '@/components/ui/skeleton';

/**
 * Policy detail loading skeleton — back link + heading + pills + 4 tabs + content cards.
 */
export default function PolicyDetailLoading() {
    return <SkeletonDetailTabs tabCount={4} />;
}
