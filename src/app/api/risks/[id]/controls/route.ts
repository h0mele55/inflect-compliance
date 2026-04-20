import { NextRequest, NextResponse } from 'next/server';
import { getLegacyCtx } from '@/app-layer/context';
import { linkControlToRisk } from '@/app-layer/usecases/risk';
import { withValidatedBody } from '@/lib/validation/route';
import { LinkRiskControlSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const POST = withApiErrorHandling(withValidatedBody(LinkRiskControlSchema, async (req, { params }: { params: { id: string } }, body) => {
    const ctx = await getLegacyCtx(req);
    const result = await linkControlToRisk(ctx, params.id, body.controlId);
    return NextResponse.json<any>(result, { status: 201 });
}));
