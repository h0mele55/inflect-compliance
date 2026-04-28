import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { unlinkEvidence } from '@/app-layer/usecases/control';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const DELETE = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; controlId: string; linkId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    await unlinkEvidence(ctx, params.controlId, params.linkId);
    return jsonResponse({ success: true });
});
