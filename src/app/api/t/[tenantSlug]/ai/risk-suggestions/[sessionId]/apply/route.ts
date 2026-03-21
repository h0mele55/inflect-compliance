import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { applySession } from '@/app-layer/usecases/risk-suggestions';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { ApplySessionSchema } from '@/app-layer/ai/risk-assessment/schemas';

export const POST = withApiErrorHandling(withValidatedBody(ApplySessionSchema, async (
    req: NextRequest,
    { params }: { params: { tenantSlug: string; sessionId: string } },
    body,
) => {
    const ctx = await getTenantCtx(params, req);
    const result = await applySession(ctx, params.sessionId, body);
    return NextResponse.json(result);
}));
