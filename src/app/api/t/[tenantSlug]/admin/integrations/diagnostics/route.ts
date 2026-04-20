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
import { requireAdminCtx } from '@/lib/auth/require-admin';
import { withApiErrorHandling } from '@/lib/errors/api';
import { getIntegrationDiagnostics } from '@/app-layer/usecases/integrations';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await requireAdminCtx(params, req);

    const diagnostics = await getIntegrationDiagnostics(ctx);

    return NextResponse.json<any>(diagnostics);
});
