import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { removeVendorDocument } from '@/app-layer/usecases/vendor';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const DELETE = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; vendorId: string; docId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    await removeVendorDocument(ctx, params.docId);
    return jsonResponse({ deleted: true });
});
