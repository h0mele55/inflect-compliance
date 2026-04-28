import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getAssetTraceability } from '@/app-layer/usecases/traceability';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; id: string } }) => {
    const ctx = await getTenantCtx(params, req);
    return jsonResponse(await getAssetTraceability(ctx, params.id));
});
