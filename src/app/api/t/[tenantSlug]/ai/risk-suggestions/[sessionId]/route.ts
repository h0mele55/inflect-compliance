import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getSession } from '@/app-layer/usecases/risk-suggestions';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(async (
    req: NextRequest,
    { params }: { params: { tenantSlug: string; sessionId: string } },
) => {
    const ctx = await getTenantCtx(params, req);
    const session = await getSession(ctx, params.sessionId);
    return jsonResponse(session);
});
