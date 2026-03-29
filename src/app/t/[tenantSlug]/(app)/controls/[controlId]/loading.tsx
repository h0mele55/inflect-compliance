import { SkeletonDetailTabs } from '@/components/ui/skeleton';

/**
 * Control detail loading skeleton — back link + heading + pills + 5 tabs + content cards.
 * Matches the tabbed detail page layout for seamless streaming.
 */
export default function ControlDetailLoading() {
    return <SkeletonDetailTabs tabCount={5} />;
}
