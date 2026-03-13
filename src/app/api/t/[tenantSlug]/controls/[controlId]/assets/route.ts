import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { linkAssetToControl, unlinkAssetFromControl } from '@/app-layer/usecases/control';
import { withValidatedBody } from '@/lib/validation/route';
import { MapControlAssetSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

type RouteParams = { params: { tenantSlug: string; controlId: string } };

export const POST = withApiErrorHandling(withValidatedBody(MapControlAssetSchema, async (req, { params }: RouteParams, body) => {
    const ctx = await getTenantCtx(params, req);
    const link = await linkAssetToControl(ctx, params.controlId, body.assetId);
    return NextResponse.json(link, { status: 201 });
}));

export const DELETE = withApiErrorHandling(withValidatedBody(MapControlAssetSchema, async (req, { params }: RouteParams, body) => {
    const ctx = await getTenantCtx(params, req);
    const result = await unlinkAssetFromControl(ctx, params.controlId, body.assetId);
    return NextResponse.json(result);
}));
