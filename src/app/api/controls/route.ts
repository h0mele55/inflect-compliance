import { NextRequest, NextResponse } from 'next/server';
import { getLegacyCtx } from '@/app-layer/context';
import { listControls, createControl } from '@/app-layer/usecases/control';
import { withValidatedBody } from '@/lib/validation/route';
import { CreateControlSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest) => {
    const ctx = await getLegacyCtx(req);
    const controls = await listControls(ctx);
    return NextResponse.json(controls);
});

export const POST = withApiErrorHandling(withValidatedBody(CreateControlSchema, async (req, _ctx, body) => {
    const ctx = await getLegacyCtx(req);
    const control = await createControl(ctx, body);
    return NextResponse.json(control, { status: 201 });
}));
