import { SkeletonDetailTabs } from '@/components/ui/skeleton';

/**
 * Risk detail loading skeleton — back link + heading + pills + 3 tabs + content cards.
 */
export default function RiskDetailLoading() {
    return <SkeletonDetailTabs tabCount={3} />;
}
