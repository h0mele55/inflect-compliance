import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { removeVendorLink } from '@/app-layer/usecases/vendor';
import { withApiErrorHandling } from '@/lib/errors/api';

export const DELETE = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; vendorId: string; linkId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    await removeVendorLink(ctx, params.linkId);
    return NextResponse.json({ deleted: true });
});
