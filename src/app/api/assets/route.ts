import { NextRequest, NextResponse } from 'next/server';
import { getLegacyCtx } from '@/app-layer/context';
import { listAssets, createAsset } from '@/app-layer/usecases/asset';
import { withValidatedBody } from '@/lib/validation/route';
import { CreateAssetSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest) => {
    const ctx = await getLegacyCtx(req);
    const assets = await listAssets(ctx);
    return NextResponse.json<any>(assets);
});

export const POST = withApiErrorHandling(withValidatedBody(CreateAssetSchema, async (req, _ctx, body) => {
    const ctx = await getLegacyCtx(req);
    const asset = await createAsset(ctx, body);
    return NextResponse.json<any>(asset, { status: 201 });
}));
