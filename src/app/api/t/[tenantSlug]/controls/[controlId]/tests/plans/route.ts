/**
 * GET  /api/t/[tenantSlug]/controls/[controlId]/tests/plans — List test plans for a control
 * POST /api/t/[tenantSlug]/controls/[controlId]/tests/plans — Create a test plan
 */
import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listControlTestPlans, createTestPlan } from '@/app-layer/usecases/control-test';
import { withValidatedBody } from '@/lib/validation/route';
import { CreateTestPlanSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; controlId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const plans = await listControlTestPlans(ctx, params.controlId);
    return NextResponse.json<any>(plans);
});

export const POST = withApiErrorHandling(withValidatedBody(CreateTestPlanSchema, async (req, { params }: { params: { tenantSlug: string; controlId: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const plan = await createTestPlan(ctx, params.controlId, body);
    return NextResponse.json<any>(plan, { status: 201 });
}));
