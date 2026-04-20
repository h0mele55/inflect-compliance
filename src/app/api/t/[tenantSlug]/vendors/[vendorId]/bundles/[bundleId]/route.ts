import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getEvidenceBundle, addBundleItem, removeBundleItem, freezeBundle } from '@/app-layer/usecases/vendor-audit';
import { withApiErrorHandling } from '@/lib/errors/api';
import { z } from 'zod';

const AddItemSchema = z.object({
    entityType: z.enum(['VENDOR_DOCUMENT', 'ASSESSMENT', 'EVIDENCE', 'CONTROL']),
    entityId: z.string().min(1),
}).strip();

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; vendorId: string; bundleId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    return NextResponse.json<any>(await getEvidenceBundle(ctx, params.bundleId));
});

export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; vendorId: string; bundleId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const url = new URL(req.url);
    if (url.searchParams.get('action') === 'freeze') {
        return NextResponse.json<any>(await freezeBundle(ctx, params.bundleId));
    }
    const raw = await req.json();
    const body = AddItemSchema.parse(raw);
    return NextResponse.json<any>(await addBundleItem(ctx, params.bundleId, body), { status: 201 });
});

export const DELETE = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; vendorId: string; bundleId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const url = new URL(req.url);
    const itemId = url.searchParams.get('itemId');
    if (!itemId) return NextResponse.json<any>({ error: 'itemId required' }, { status: 400 });
    return NextResponse.json<any>(await removeBundleItem(ctx, params.bundleId, itemId));
});
