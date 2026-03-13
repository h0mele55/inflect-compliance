import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { updateControlTask, deleteControlTask } from '@/app-layer/usecases/control';
import { withValidatedBody } from '@/lib/validation/route';
import { UpdateControlTaskSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const PATCH = withApiErrorHandling(withValidatedBody(UpdateControlTaskSchema, async (req, { params }: { params: { tenantSlug: string; taskId: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const task = await updateControlTask(ctx, params.taskId, body);
    return NextResponse.json(task);
}));

export const DELETE = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; taskId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    await deleteControlTask(ctx, params.taskId);
    return NextResponse.json({ success: true });
});
