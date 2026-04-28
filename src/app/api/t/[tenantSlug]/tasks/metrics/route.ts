import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getTaskMetrics } from '@/app-layer/usecases/task';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const metrics = await getTaskMetrics(ctx);
    return jsonResponse(metrics);
});
