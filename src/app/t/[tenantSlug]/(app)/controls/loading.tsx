import {
    SkeletonPageHeader,
    SkeletonCompactFilterBar,
    SkeletonDataTable,
} from '@/components/ui/skeleton';

/**
 * Route-level loading.tsx for /t/[tenantSlug]/controls.
 * Next.js App Router renders this automatically via Suspense
 * while the page component is loading/streaming.
 *
 * Layout matches the real ControlsPage:
 *   - Page header (title + action buttons)
 *   - Compact filter bar (search + pill dropdowns)
 *   - Data table (8 columns × 10 rows)
 */
export default function ControlsLoading() {
    return (
        <div className="space-y-6 animate-fadeIn" aria-busy="true" aria-label="Loading controls">
            <SkeletonPageHeader />
            <SkeletonCompactFilterBar />
            <SkeletonDataTable rows={10} cols={8} />
        </div>
    );
}
