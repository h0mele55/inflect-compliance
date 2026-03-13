import { NextRequest, NextResponse } from 'next/server';
import { getLegacyCtx } from '@/app-layer/context';
import { getRisk, updateRisk, deleteRisk } from '@/app-layer/usecases/risk';
import { withValidatedBody } from '@/lib/validation/route';
import { UpdateRiskSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { id: string } }) => {
    const ctx = await getLegacyCtx(req);
    const risk = await getRisk(ctx, params.id);
    return NextResponse.json(risk);
});

export const PUT = withApiErrorHandling(withValidatedBody(UpdateRiskSchema, async (req, { params }: { params: { id: string } }, body) => {
    const ctx = await getLegacyCtx(req);
    const risk = await updateRisk(ctx, params.id, body);
    return NextResponse.json({ success: true, risk });
}));

export const DELETE = withApiErrorHandling(async (req: NextRequest, { params }: { params: { id: string } }) => {
    const ctx = await getLegacyCtx(req);
    await deleteRisk(ctx, params.id);
    return NextResponse.json({ success: true });
});
