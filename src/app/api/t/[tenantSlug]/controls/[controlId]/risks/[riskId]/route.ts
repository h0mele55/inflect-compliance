import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { unmapControlFromRisk } from '@/app-layer/usecases/traceability';
import { withApiErrorHandling } from '@/lib/errors/api';

export const DELETE = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; controlId: string; riskId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    await unmapControlFromRisk(ctx, params.controlId, params.riskId);
    return NextResponse.json({ ok: true });
});
