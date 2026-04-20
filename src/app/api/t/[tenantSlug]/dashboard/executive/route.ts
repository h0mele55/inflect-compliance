import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getExecutiveDashboard } from '@/app-layer/usecases/dashboard';
import { withApiErrorHandling } from '@/lib/errors/api';

/**
 * GET /api/t/:tenantSlug/dashboard/executive
 *
 * Returns the full executive KPI payload — control coverage %, risk breakdown,
 * evidence expiry, policy/task/vendor summaries — in a single response.
 */
export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const payload = await getExecutiveDashboard(ctx);
    return NextResponse.json<any>(payload);
});
