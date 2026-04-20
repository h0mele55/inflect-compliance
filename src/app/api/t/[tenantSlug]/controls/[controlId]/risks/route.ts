import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listControlRisks, mapControlToRisk, unmapControlFromRisk } from '@/app-layer/usecases/traceability';
import { withApiErrorHandling } from '@/lib/errors/api';
import { z } from 'zod';

const LinkSchema = z.object({ riskId: z.string().min(1), rationale: z.string().optional() }).strip();

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; controlId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    return NextResponse.json<any>(await listControlRisks(ctx, params.controlId));
});

export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; controlId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const body = LinkSchema.parse(await req.json());
    return NextResponse.json<any>(await mapControlToRisk(ctx, params.controlId, body.riskId, body.rationale), { status: 201 });
});
