/**
 * GET   /api/t/[tenantSlug]/tests/plans/[planId] — Get test plan details
 * PATCH /api/t/[tenantSlug]/tests/plans/[planId] — Update a test plan
 */
import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getTestPlan, updateTestPlan } from '@/app-layer/usecases/control-test';
import { withValidatedBody } from '@/lib/validation/route';
import { UpdateTestPlanSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; planId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const plan = await getTestPlan(ctx, params.planId);
    return jsonResponse(plan);
});

export const PATCH = withApiErrorHandling(withValidatedBody(UpdateTestPlanSchema, async (req, { params }: { params: { tenantSlug: string; planId: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const plan = await updateTestPlan(ctx, params.planId, body);
    return jsonResponse(plan);
}));
