import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { purgeAsset } from '@/app-layer/usecases/asset';
import { withApiErrorHandling } from '@/lib/errors/api';

export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; id: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const result = await purgeAsset(ctx, params.id);
    return NextResponse.json<any>(result);
});
