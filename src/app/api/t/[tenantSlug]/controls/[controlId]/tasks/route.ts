import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listControlTasks, createControlTask } from '@/app-layer/usecases/control';
import { withValidatedBody } from '@/lib/validation/route';
import { CreateControlTaskSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; controlId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const tasks = await listControlTasks(ctx, params.controlId);
    return NextResponse.json(tasks);
});

export const POST = withApiErrorHandling(withValidatedBody(CreateControlTaskSchema, async (req, { params }: { params: { tenantSlug: string; controlId: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const task = await createControlTask(ctx, params.controlId, body);
    return NextResponse.json(task, { status: 201 });
}));
