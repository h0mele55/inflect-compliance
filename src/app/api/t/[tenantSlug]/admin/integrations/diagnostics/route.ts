/**
 * GET /api/t/[tenantSlug]/admin/integrations/diagnostics
 *
 * Admin-only diagnostics endpoint for integration health.
 * Returns:
 *   - last execution per connection
 *   - last webhook event per provider
 *   - recent errors summary
 *   - scheduler status
 *
 * Secrets are never included. Delegates to app-layer usecase.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { forbidden } from '@/lib/errors/types';
import { getIntegrationDiagnostics } from '@/app-layer/usecases/integrations';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    if (!ctx.permissions.canAdmin) throw forbidden('Admin only');

    const diagnostics = await getIntegrationDiagnostics(ctx);

    return NextResponse.json(diagnostics);
});
