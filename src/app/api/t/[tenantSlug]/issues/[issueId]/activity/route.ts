/** @deprecated Use /api/t/[tenantSlug]/tasks/[taskId]/activity */
import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getTaskActivity } from '@/app-layer/usecases/task';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; issueId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const activity = await getTaskActivity(ctx, params.issueId);
    return NextResponse.json<any>(activity);
});
