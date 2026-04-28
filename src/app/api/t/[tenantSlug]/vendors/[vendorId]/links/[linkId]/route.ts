import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { removeVendorLink } from '@/app-layer/usecases/vendor';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const DELETE = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; vendorId: string; linkId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    await removeVendorLink(ctx, params.linkId);
    return jsonResponse({ deleted: true });
});
