import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listAssetControls, mapAssetToControl, unmapAssetFromControl } from '@/app-layer/usecases/traceability';
import { withApiErrorHandling } from '@/lib/errors/api';
import { z } from 'zod';

const LinkSchema = z.object({
    controlId: z.string().min(1),
    coverageType: z.enum(['FULL', 'PARTIAL', 'UNKNOWN']).optional(),
    rationale: z.string().optional(),
}).strip();

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; id: string } }) => {
    const ctx = await getTenantCtx(params, req);
    return NextResponse.json<any>(await listAssetControls(ctx, params.id));
});

export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; id: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const body = LinkSchema.parse(await req.json());
    return NextResponse.json<any>(await mapAssetToControl(ctx, params.id, body.controlId, body.coverageType, body.rationale), { status: 201 });
});
