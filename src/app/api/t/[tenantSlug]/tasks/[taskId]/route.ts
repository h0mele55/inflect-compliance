import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getTask, updateTask } from '@/app-layer/usecases/task';
import { withValidatedBody } from '@/lib/validation/route';
import { UpdateTaskSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; taskId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const task = await getTask(ctx, params.taskId);
    return NextResponse.json(task);
});

export const PATCH = withApiErrorHandling(withValidatedBody(UpdateTaskSchema, async (req, { params }: { params: { tenantSlug: string; taskId: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const task = await updateTask(ctx, params.taskId, body);
    return NextResponse.json(task);
}));
