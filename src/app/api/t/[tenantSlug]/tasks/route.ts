import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listTasks, listTasksPaginated, createTask } from '@/app-layer/usecases/task';
import { withValidatedBody } from '@/lib/validation/route';
import { CreateTaskSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { z } from 'zod';
import { normalizeQ } from '@/lib/filters/query-helpers';

const TaskQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
    status: z.string().optional(),
    type: z.string().optional(),
    severity: z.string().optional(),
    priority: z.string().optional(),
    assigneeUserId: z.string().optional(),
    controlId: z.string().optional(),
    due: z.enum(['overdue', 'next7d']).optional(),
    q: z.string().optional().transform(normalizeQ),
    linkedEntityType: z.string().optional(),
    linkedEntityId: z.string().optional(),
}).strip();

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
    const query = TaskQuerySchema.parse(sp);

    const hasPagination = query.limit || query.cursor;
    if (hasPagination) {
        const result = await listTasksPaginated(ctx, {
            limit: query.limit,
            cursor: query.cursor,
            filters: {
                status: query.status,
                type: query.type,
                severity: query.severity,
                priority: query.priority,
                assigneeUserId: query.assigneeUserId,
                controlId: query.controlId,
                due: query.due,
                q: query.q,
                linkedEntityType: query.linkedEntityType,
                linkedEntityId: query.linkedEntityId,
            },
        });
        return NextResponse.json<any>(result);
    }

    // Backward compat: return flat array
    const tasks = await listTasks(ctx, {
        status: query.status,
        type: query.type,
        severity: query.severity,
        priority: query.priority,
        assigneeUserId: query.assigneeUserId,
        controlId: query.controlId,
        due: query.due,
        q: query.q,
        linkedEntityType: query.linkedEntityType,
        linkedEntityId: query.linkedEntityId,
    });
    return NextResponse.json<any>(tasks);
});

export const POST = withApiErrorHandling(withValidatedBody(CreateTaskSchema, async (req, { params }: { params: { tenantSlug: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const task = await createTask(ctx, body);
    return NextResponse.json<any>(task, { status: 201 });
}));
