import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getVendor, updateVendor } from '@/app-layer/usecases/vendor';
import { withValidatedBody } from '@/lib/validation/route';
import { UpdateVendorSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; vendorId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const vendor = await getVendor(ctx, params.vendorId);
    return NextResponse.json<any>(vendor);
});

export const PATCH = withApiErrorHandling(withValidatedBody(UpdateVendorSchema, async (req: NextRequest, { params }: { params: { tenantSlug: string; vendorId: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const vendor = await updateVendor(ctx, params.vendorId, body);
    return NextResponse.json<any>(vendor);
}));
