import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getRisk, updateRisk, deleteRisk } from '@/app-layer/usecases/risk';
import { withValidatedBody } from '@/lib/validation/route';
import { UpdateRiskSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; id: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const risk = await getRisk(ctx, params.id);
    return NextResponse.json(risk);
});

export const PUT = withApiErrorHandling(withValidatedBody(UpdateRiskSchema, async (req, { params }: { params: { tenantSlug: string; id: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const risk = await updateRisk(ctx, params.id, body);
    return NextResponse.json({ success: true, risk });
}));

export const DELETE = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; id: string } }) => {
    const ctx = await getTenantCtx(params, req);
    await deleteRisk(ctx, params.id);
    return NextResponse.json({ success: true });
});
