import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listAssets, createAsset, listAssetsWithDeleted } from '@/app-layer/usecases/asset';
import { withValidatedBody } from '@/lib/validation/route';
import { CreateAssetSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const includeDeleted = req.nextUrl.searchParams.get('includeDeleted') === 'true';
    const assets = includeDeleted ? await listAssetsWithDeleted(ctx) : await listAssets(ctx);
    return NextResponse.json(assets);
});

export const POST = withApiErrorHandling(withValidatedBody(CreateAssetSchema, async (req, { params }: { params: { tenantSlug: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const asset = await createAsset(ctx, body);
    return NextResponse.json(asset, { status: 201 });
}));
