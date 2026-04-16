import { getTenantCtx } from '@/app-layer/context';
import { listVendors } from '@/app-layer/usecases/vendor';
import { getPermissionsForRole } from '@/lib/permissions';
import { VendorsClient } from './VendorsClient';

export const dynamic = 'force-dynamic';

/**
 * Vendors — Server Component wrapper.
 * Fetches vendor list server-side (with URL filters applied),
 * delegates interaction to client island.
 */
export default async function VendorRegisterPage({
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
    for (const key of ['q', 'status', 'criticality', 'reviewDue']) {
        const val = sp[key];
        if (typeof val === 'string' && val) filters[key] = val;
    }

    const appPerms = getPermissionsForRole(ctx.role);
    const vendors = await listVendors(ctx, Object.keys(filters).length > 0 ? filters : undefined);

    return (
        <div className="space-y-6">
            <VendorsClient
                initialVendors={JSON.parse(JSON.stringify(vendors))}
                initialFilters={filters}
                tenantSlug={tenantSlug}
                permissions={{
                    canCreate: appPerms.vendors.create,
                }}
            />
        </div>
    );
}
