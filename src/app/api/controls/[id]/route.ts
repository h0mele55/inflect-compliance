import { NextRequest, NextResponse } from 'next/server';
import { getLegacyCtx } from '@/app-layer/context';
import { getControl, updateControl } from '@/app-layer/usecases/control';
import { withValidatedBody } from '@/lib/validation/route';
import { UpdateControlSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { id: string } }) => {
    const ctx = await getLegacyCtx(req);
    const control = await getControl(ctx, params.id);
    return NextResponse.json(control);
});

export const PUT = withApiErrorHandling(withValidatedBody(UpdateControlSchema, async (req, { params }: { params: { id: string } }, body) => {
    const ctx = await getLegacyCtx(req);
    const control = await updateControl(ctx, params.id, body);
    return NextResponse.json({ success: true, control });
}));
