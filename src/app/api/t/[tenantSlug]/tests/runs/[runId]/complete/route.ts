/**
 * POST /api/t/[tenantSlug]/tests/runs/[runId]/complete — Complete a test run with result
 */
import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { completeTestRun } from '@/app-layer/usecases/control-test';
import { withValidatedBody } from '@/lib/validation/route';
import { CompleteTestRunSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const POST = withApiErrorHandling(withValidatedBody(CompleteTestRunSchema, async (req, { params }: { params: { tenantSlug: string; runId: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const run = await completeTestRun(ctx, params.runId, body);
    return NextResponse.json(run);
}));
