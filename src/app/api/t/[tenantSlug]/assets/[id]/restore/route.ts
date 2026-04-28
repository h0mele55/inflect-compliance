import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { restoreAsset } from '@/app-layer/usecases/asset';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; id: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const result = await restoreAsset(ctx, params.id);
    return jsonResponse(result);
});
