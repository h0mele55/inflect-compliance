import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { enrichVendor } from '@/app-layer/usecases/vendor';
import { withApiErrorHandling } from '@/lib/errors/api';

export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; vendorId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const vendor = await enrichVendor(ctx, params.vendorId);
    return NextResponse.json<any>(vendor);
});
