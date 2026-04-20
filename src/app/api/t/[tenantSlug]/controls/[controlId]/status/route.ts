import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { setControlStatus } from '@/app-layer/usecases/control';
import { withValidatedBody } from '@/lib/validation/route';
import { SetControlStatusSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const POST = withApiErrorHandling(withValidatedBody(SetControlStatusSchema, async (req, { params }: { params: { tenantSlug: string; controlId: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const control = await setControlStatus(ctx, params.controlId, body.status);
    return NextResponse.json<any>(control);
}));
