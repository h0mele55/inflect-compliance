import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listVendors, createVendor } from '@/app-layer/usecases/vendor';
import { withValidatedBody } from '@/lib/validation/route';
import { CreateVendorSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const url = req.nextUrl;
    const filters = {
        status: url.searchParams.get('status') || undefined,
        criticality: url.searchParams.get('criticality') || undefined,
        riskRating: url.searchParams.get('riskRating') || undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reviewDue: (url.searchParams.get('reviewDue') as any) || undefined,
        q: url.searchParams.get('q') || undefined,
    };
    const vendors = await listVendors(ctx, filters);
    return NextResponse.json(vendors);
});

export const POST = withApiErrorHandling(withValidatedBody(CreateVendorSchema, async (req: NextRequest, { params }: { params: { tenantSlug: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vendor = await createVendor(ctx, body as any);
    return NextResponse.json(vendor, { status: 201 });
}));
