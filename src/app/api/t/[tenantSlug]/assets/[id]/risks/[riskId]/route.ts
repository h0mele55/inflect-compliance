import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { unmapAssetFromRisk } from '@/app-layer/usecases/traceability';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const DELETE = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; id: string; riskId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    await unmapAssetFromRisk(ctx, params.id, params.riskId);
    return jsonResponse({ ok: true });
});
