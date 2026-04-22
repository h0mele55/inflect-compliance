import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { coverageSummary } from '@/app-layer/usecases/traceability';
import { withApiErrorHandling } from '@/lib/errors/api';

/**
 * GET /api/t/[tenantSlug]/coverage
 *
 * Returns the asset–control–risk coverage summary for the tenant.
 * Used by the Coverage Dashboard page.
 */
export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const data = await coverageSummary(ctx);
    return NextResponse.json<any>(data);
});
