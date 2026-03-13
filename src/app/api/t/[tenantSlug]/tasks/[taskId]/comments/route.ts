import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listTaskComments, addTaskComment } from '@/app-layer/usecases/task';
import { withValidatedBody } from '@/lib/validation/route';
import { AddTaskCommentSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; taskId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const comments = await listTaskComments(ctx, params.taskId);
    return NextResponse.json(comments);
});

export const POST = withApiErrorHandling(withValidatedBody(AddTaskCommentSchema, async (req, { params }: { params: { tenantSlug: string; taskId: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const comment = await addTaskComment(ctx, params.taskId, body.body);
    return NextResponse.json(comment, { status: 201 });
}));
