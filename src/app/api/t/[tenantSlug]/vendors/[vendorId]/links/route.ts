import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listVendorLinks, addVendorLink } from '@/app-layer/usecases/vendor';
import { withValidatedBody } from '@/lib/validation/route';
import { AddVendorLinkSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; vendorId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const links = await listVendorLinks(ctx, params.vendorId);
    return NextResponse.json<any>(links);
});

export const POST = withApiErrorHandling(withValidatedBody(AddVendorLinkSchema, async (req: NextRequest, { params }: { params: { tenantSlug: string; vendorId: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const link = await addVendorLink(ctx, params.vendorId, body);
    return NextResponse.json<any>(link, { status: 201 });
}));
