import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listTasks, createTask } from '@/app-layer/usecases/task';
import { withValidatedBody } from '@/lib/validation/route';
import { CreateTaskSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const sp = req.nextUrl.searchParams;
    const tasks = await listTasks(ctx, {
        status: sp.get('status') ?? undefined,
        type: sp.get('type') ?? undefined,
        severity: sp.get('severity') ?? undefined,
        priority: sp.get('priority') ?? undefined,
        assigneeUserId: sp.get('assigneeUserId') ?? undefined,
        controlId: sp.get('controlId') ?? undefined,
        due: (sp.get('due') as 'overdue' | 'next7d') ?? undefined,
        q: sp.get('q') ?? undefined,
        linkedEntityType: sp.get('linkedEntityType') ?? undefined,
        linkedEntityId: sp.get('linkedEntityId') ?? undefined,
    });
    return NextResponse.json(tasks);
});

export const POST = withApiErrorHandling(withValidatedBody(CreateTaskSchema, async (req, { params }: { params: { tenantSlug: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const task = await createTask(ctx, body);
    return NextResponse.json(task, { status: 201 });
}));
