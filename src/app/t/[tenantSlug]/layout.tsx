import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { resolveTenantContext } from '@/lib/tenant-context';
import { TenantProvider } from '@/lib/tenant-context-provider';

/**
 * Tenant-scoped layout.
 * Resolves tenant context from URL slug and wraps children with TenantProvider.
 * If user has no membership → 404.
 */
export default async function TenantLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ tenantSlug: string }>;
}) {
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

    const tenantValue = {
        tenantId: tenantCtx.tenant.id,
        tenantSlug: tenantCtx.tenant.slug,
        tenantName: tenantCtx.tenant.name,
        role: tenantCtx.role,
        permissions: tenantCtx.permissions,
    };

    return (
        <TenantProvider value={tenantValue}>
            {children}
        </TenantProvider>
    );
}
