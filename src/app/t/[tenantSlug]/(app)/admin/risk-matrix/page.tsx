/**
 * /t/[tenantSlug]/admin/risk-matrix — Epic 44.5
 *
 * Admin entry point for the tenant-scoped risk-matrix configuration.
 * Server component fetches the effective config (canonical default
 * for tenants who haven't customised) and hands it to a client
 * island for interactive editing. Permission is enforced two ways:
 *
 *   1. The parent `/admin/layout.tsx` short-circuits non-admins to
 *      `<ForbiddenPage>` before this server component runs.
 *   2. The client's PUT request to `/api/t/:slug/admin/risk-matrix-config`
 *      is gated by `requirePermission('admin.manage')` server-side
 *      (see `src/lib/security/route-permissions.ts`).
 */

import { getTenantCtx } from '@/app-layer/context';
import { getRiskMatrixConfig } from '@/app-layer/usecases/risk-matrix-config';
import { RiskMatrixAdminClient } from './RiskMatrixAdminClient';

export const dynamic = 'force-dynamic';

export default async function RiskMatrixAdminPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx({ tenantSlug });
    const initialConfig = await getRiskMatrixConfig(ctx);

    return (
        <RiskMatrixAdminClient
            tenantSlug={tenantSlug}
            initialConfig={initialConfig}
        />
    );
}
