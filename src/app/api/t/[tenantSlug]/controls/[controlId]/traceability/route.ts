import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getControlTraceability } from '@/app-layer/usecases/traceability';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; controlId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    return NextResponse.json<any>(await getControlTraceability(ctx, params.controlId));
});
