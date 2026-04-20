/**
 * POST /api/t/[tenantSlug]/tests/runs/[runId]/retest — Create retest run from a completed run
 */
import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { retestFromRun } from '@/app-layer/usecases/control-test';
import { withApiErrorHandling } from '@/lib/errors/api';

export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; runId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const run = await retestFromRun(ctx, params.runId);
    return NextResponse.json<any>(run, { status: 201 });
});
