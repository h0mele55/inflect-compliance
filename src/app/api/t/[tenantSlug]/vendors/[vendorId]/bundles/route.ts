import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listEvidenceBundles, createEvidenceBundle } from '@/app-layer/usecases/vendor-audit';
import { withApiErrorHandling } from '@/lib/errors/api';
import { z } from 'zod';
import { badRequest } from '@/lib/errors/types';

const CreateBundleSchema = z.object({ name: z.string().min(1), description: z.string().optional() }).strip();

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; vendorId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    return NextResponse.json<any>(await listEvidenceBundles(ctx, params.vendorId));
});

export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; vendorId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const raw = await req.json();
    const body = CreateBundleSchema.parse(raw);
    return NextResponse.json<any>(await createEvidenceBundle(ctx, params.vendorId, body), { status: 201 });
});
