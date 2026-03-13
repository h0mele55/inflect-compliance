import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listBundleItems, addBundleItem } from '@/app-layer/usecases/issue';
import { withValidatedBody } from '@/lib/validation/route';
import { AddBundleItemSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; issueId: string; bundleId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const items = await listBundleItems(ctx, params.bundleId);
    return NextResponse.json(items);
});

export const POST = withApiErrorHandling(withValidatedBody(AddBundleItemSchema, async (req: NextRequest, { params }: { params: { tenantSlug: string; issueId: string; bundleId: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const item = await addBundleItem(ctx, params.bundleId, body);
    return NextResponse.json(item, { status: 201 });
}));
