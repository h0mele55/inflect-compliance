/**
 * POST /api/t/[tenantSlug]/tests/plans/[planId]/runs — Create a test run for this plan
 */
import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { createTestRun } from '@/app-layer/usecases/control-test';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; planId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const run = await createTestRun(ctx, params.planId);
    return jsonResponse(run, { status: 201 });
});
