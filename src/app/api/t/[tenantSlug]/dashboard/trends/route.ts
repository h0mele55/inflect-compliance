import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getComplianceTrends } from '@/app-layer/usecases/compliance-trends';
import { withApiErrorHandling } from '@/lib/errors/api';

/**
 * GET /api/t/:tenantSlug/dashboard/trends?days=90
 *
 * Returns daily compliance KPI snapshots for trend visualization.
 */
export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const days = parseInt(req.nextUrl.searchParams.get('days') ?? '90', 10);
    const payload = await getComplianceTrends(ctx, isNaN(days) ? 90 : days);
    return NextResponse.json(payload);
});
