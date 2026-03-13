/**
 * GET /api/t/[tenantSlug]/tests/dashboard?period=30|90 — Dashboard metrics
 */
import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getTestDashboardMetrics } from '@/app-layer/usecases/due-planning';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const url = new URL(req.url);
    const period = parseInt(url.searchParams.get('period') || '30', 10);
    const validPeriod = [30, 90, 180, 365].includes(period) ? period : 30;
    const metrics = await getTestDashboardMetrics(ctx, validPeriod);
    return NextResponse.json(metrics);
});
