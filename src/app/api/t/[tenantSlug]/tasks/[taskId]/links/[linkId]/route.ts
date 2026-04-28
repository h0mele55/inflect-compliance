import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { removeTaskLink } from '@/app-layer/usecases/task';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const DELETE = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; taskId: string; linkId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    await removeTaskLink(ctx, params.linkId);
    return jsonResponse({ success: true });
});
