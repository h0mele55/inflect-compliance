import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { removeVendorDocument } from '@/app-layer/usecases/vendor';
import { withApiErrorHandling } from '@/lib/errors/api';

export const DELETE = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; vendorId: string; docId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    await removeVendorDocument(ctx, params.docId);
    return NextResponse.json<any>({ deleted: true });
});
