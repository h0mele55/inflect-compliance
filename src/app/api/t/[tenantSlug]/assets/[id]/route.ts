import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getAsset, updateAsset, deleteAsset } from '@/app-layer/usecases/asset';
import { withValidatedBody } from '@/lib/validation/route';
import { UpdateAssetSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; id: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const asset = await getAsset(ctx, params.id);
    return NextResponse.json(asset);
});

export const PUT = withApiErrorHandling(withValidatedBody(UpdateAssetSchema, async (req, { params }: { params: { tenantSlug: string; id: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const asset = await updateAsset(ctx, params.id, body);
    return NextResponse.json({ success: true, asset });
}));

export const DELETE = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; id: string } }) => {
    const ctx = await getTenantCtx(params, req);
    await deleteAsset(ctx, params.id);
    return NextResponse.json({ success: true });
});
