/**
 * GET /api/t/[tenantSlug]/tests/plans — List ALL test plans across all controls
 */
import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listAllTestPlans } from '@/app-layer/usecases/due-planning';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const plans = await listAllTestPlans(ctx);
    return NextResponse.json(plans);
});
