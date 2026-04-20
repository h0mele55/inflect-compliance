import { getTenantCtx } from '@/app-layer/context';
import { listControls } from '@/app-layer/usecases/control';
import { ControlsClient } from './ControlsClient';

export const dynamic = 'force-dynamic';

/**
 * Controls — Server Component.
 * Fetches controls list server-side (with URL filters applied),
 * delegates all interaction to client island.
 */
export default async function ControlsPage({
    params,
    searchParams,
}: {
    params: Promise<{ tenantSlug: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { tenantSlug } = await params;
    const sp = await searchParams;
    const ctx = await getTenantCtx({ tenantSlug });

    // Build filters from searchParams for server-side data fetch.
    // Keys here must stay in sync with the Controls filter config
    // (`src/app/t/[tenantSlug]/(app)/controls/filter-defs.ts`) so SSR and
    // client filter state agree on the first paint.
    const filters: Record<string, string> = {};
    for (const key of ['q', 'status', 'applicability', 'ownerUserId', 'category']) {
        const val = sp[key];
        if (typeof val === 'string' && val) filters[key] = val;
    }

    const controls = await listControls(ctx, Object.keys(filters).length > 0 ? filters : undefined);

    return (
        <ControlsClient
            initialControls={JSON.parse(JSON.stringify(controls))}
            initialFilters={filters}
            tenantSlug={tenantSlug}
            permissions={ctx.permissions}
            appPermissions={{
                controls: ctx.appPermissions.controls,
            }}
        />
    );
}
