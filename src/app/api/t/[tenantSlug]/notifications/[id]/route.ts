import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { markNotificationRead } from '@/app-layer/usecases/notification';
import { withValidatedBody } from '@/lib/validation/route';
import { EmptyBodySchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const PUT = withApiErrorHandling(withValidatedBody(EmptyBodySchema, async (req, { params }: { params: { tenantSlug: string; id: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const result = await markNotificationRead(ctx, params.id);
    return NextResponse.json<any>(result);
}));
