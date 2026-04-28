import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getControlTraceability } from '@/app-layer/usecases/traceability';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; controlId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    return jsonResponse(await getControlTraceability(ctx, params.controlId));
});
