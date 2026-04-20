import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listAssetRisks, mapAssetToRisk } from '@/app-layer/usecases/traceability';
import { withApiErrorHandling } from '@/lib/errors/api';
import { z } from 'zod';

const LinkSchema = z.object({
    riskId: z.string().min(1),
    exposureLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
    rationale: z.string().optional(),
}).strip();

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; id: string } }) => {
    const ctx = await getTenantCtx(params, req);
    return NextResponse.json<any>(await listAssetRisks(ctx, params.id));
});

export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; id: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const body = LinkSchema.parse(await req.json());
    return NextResponse.json<any>(await mapAssetToRisk(ctx, params.id, body.riskId, body.exposureLevel, body.rationale), { status: 201 });
});
