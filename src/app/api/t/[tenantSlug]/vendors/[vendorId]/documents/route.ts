import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listVendorDocuments, addVendorDocument } from '@/app-layer/usecases/vendor';
import { withValidatedBody } from '@/lib/validation/route';
import { CreateVendorDocumentSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; vendorId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const docs = await listVendorDocuments(ctx, params.vendorId);
    return NextResponse.json(docs);
});

export const POST = withApiErrorHandling(withValidatedBody(CreateVendorDocumentSchema, async (req: NextRequest, { params }: { params: { tenantSlug: string; vendorId: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const doc = await addVendorDocument(ctx, params.vendorId, body);
    return NextResponse.json(doc, { status: 201 });
}));
