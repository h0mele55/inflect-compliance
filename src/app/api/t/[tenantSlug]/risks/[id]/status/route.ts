import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { updateRisk } from '@/app-layer/usecases/risk';
import { withValidatedBody } from '@/lib/validation/route';
import { SetRiskStatusSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

type RouteParams = { params: { tenantSlug: string; id: string } };

export const PATCH = withApiErrorHandling(withValidatedBody(SetRiskStatusSchema, async (req, { params }: RouteParams, body) => {
    const ctx = await getTenantCtx(params, req);
    const risk = await updateRisk(ctx, params.id, { status: body.status });
    return jsonResponse(risk);
}));
