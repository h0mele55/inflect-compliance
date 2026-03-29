import { SkeletonDetailTabs } from '@/components/ui/skeleton';

/**
 * Vendor detail loading skeleton — back link + heading + pills + 4 tabs + content cards.
 */
export default function VendorDetailLoading() {
    return <SkeletonDetailTabs tabCount={4} />;
}
