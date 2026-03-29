import { getTenantCtx } from '@/app-layer/context';
import { listControls } from '@/app-layer/usecases/control';
import { getPermissionsForRole } from '@/lib/permissions';
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

    // Build filters from searchParams for server-side data fetch
    const filters: Record<string, string> = {};
    for (const key of ['q', 'status', 'applicability']) {
        const val = sp[key];
        if (typeof val === 'string' && val) filters[key] = val;
    }

    const controls = await listControls(ctx, Object.keys(filters).length > 0 ? filters : undefined);
    const appPerms = getPermissionsForRole(ctx.role);

    return (
        <ControlsClient
            initialControls={JSON.parse(JSON.stringify(controls))}
            initialFilters={filters}
            tenantSlug={tenantSlug}
            permissions={ctx.permissions}
            appPermissions={{
                controls: appPerms.controls,
            }}
        />
    );
}
