import { NextRequest, NextResponse } from 'next/server';
import { getLegacyCtx } from '@/app-layer/context';
import { listTasks, createTask } from '@/app-layer/usecases/task';
import { withValidatedBody } from '@/lib/validation/route';
import { CreateTaskSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest) => {
    const ctx = await getLegacyCtx(req);
    const tasks = await listTasks(ctx);
    return NextResponse.json<any>(tasks);
});

export const POST = withApiErrorHandling(withValidatedBody(CreateTaskSchema, async (req, _ctx, body) => {
    const ctx = await getLegacyCtx(req);
    const task = await createTask(ctx, body);
    return NextResponse.json<any>(task, { status: 201 });
}));
