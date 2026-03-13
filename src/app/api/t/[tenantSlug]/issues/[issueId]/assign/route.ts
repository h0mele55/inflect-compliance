/** @deprecated Use /api/t/[tenantSlug]/tasks/[taskId]/assign */
import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { assignTask } from '@/app-layer/usecases/task';
import { withValidatedBody } from '@/lib/validation/route';
import { AssignTaskSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const POST = withApiErrorHandling(withValidatedBody(AssignTaskSchema, async (req, { params }: { params: { tenantSlug: string; issueId: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const task = await assignTask(ctx, params.issueId, body.assigneeUserId);
    return NextResponse.json(task);
}));
