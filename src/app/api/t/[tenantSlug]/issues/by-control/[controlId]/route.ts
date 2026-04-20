/** @deprecated Use /api/t/[tenantSlug]/tasks with controlId filter */
import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listTasksByControl } from '@/app-layer/usecases/task';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; controlId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const tasks = await listTasksByControl(ctx, params.controlId);
    return NextResponse.json<any>(tasks);
});
