import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listSubprocessors, addSubprocessor, removeSubprocessor } from '@/app-layer/usecases/vendor-audit';
import { withApiErrorHandling } from '@/lib/errors/api';
import { z } from 'zod';

const AddSubprocessorSchema = z.object({
    subprocessorVendorId: z.string().min(1),
    purpose: z.string().optional(),
    dataTypes: z.string().optional(),
    country: z.string().optional(),
}).strip();

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; vendorId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    return NextResponse.json(await listSubprocessors(ctx, params.vendorId));
});

export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; vendorId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const raw = await req.json();
    const body = AddSubprocessorSchema.parse(raw);
    return NextResponse.json(await addSubprocessor(ctx, params.vendorId, body), { status: 201 });
});

export const DELETE = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; vendorId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const url = new URL(req.url);
    const relationId = url.searchParams.get('relationId');
    if (!relationId) return NextResponse.json({ error: 'relationId required' }, { status: 400 });
    return NextResponse.json(await removeSubprocessor(ctx, relationId));
});
