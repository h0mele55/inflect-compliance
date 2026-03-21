import { notFound } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { auth } from '@/auth';
import { resolveTenantContext } from '@/lib/tenant-context';
import { TenantProvider } from '@/lib/tenant-context-provider';
import { getTenantPlan } from '@/lib/entitlements-server';

/**
 * This layout depends on auth cookies and database queries — it can never be statically generated.
 * Without this, Next.js attempts static path generation and crashes during compilation.
 */
export const dynamic = 'force-dynamic';

/**
 * Tenant-scoped layout.
 * Resolves tenant context from URL slug and wraps children with TenantProvider.
 * If user has no membership → 404.
 *
 * ARCHITECTURAL NOTE: This layout is the security boundary for tenant permission isolation.
 * It uses noStore() + force-dynamic to guarantee per-request freshness — permissions are
 * NEVER served from a stale cache. The client-side SidebarNav filter is a defense-in-depth
 * layer, not the primary gate.
 */
export default async function TenantLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ tenantSlug: string }>;
}) {
    // Prevent Next.js from caching this layout's output between different user sessions.
    // Without this, an admin's server-rendered layout can be stale-served to a reader user.
    noStore();

    const { tenantSlug } = await params;

    // Get current user session
    const session = await auth();
    if (!session?.user?.id) {
        // Middleware should have caught this, but guard here too
        notFound();
    }

    // Resolve tenant context (throws notFound/forbidden if invalid)
    let tenantCtx;
    try {
        tenantCtx = await resolveTenantContext({ tenantSlug }, session.user.id);
    } catch {
        notFound();
    }

    const plan = await getTenantPlan(tenantCtx.tenant.id) ?? undefined;

    const tenantValue = {
        tenantId: tenantCtx.tenant.id,
        tenantSlug: tenantCtx.tenant.slug,
        tenantName: tenantCtx.tenant.name,
        role: tenantCtx.role,
        plan,
        permissions: tenantCtx.permissions,
        appPermissions: tenantCtx.appPermissions,
    };

    return (
        <TenantProvider value={tenantValue}>
            {children}
        </TenantProvider>
    );
}
