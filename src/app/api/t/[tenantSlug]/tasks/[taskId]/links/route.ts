import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listTaskLinks, addTaskLink } from '@/app-layer/usecases/task';
import { withValidatedBody } from '@/lib/validation/route';
import { AddTaskLinkSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; taskId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const links = await listTaskLinks(ctx, params.taskId);
    return NextResponse.json(links);
});

export const POST = withApiErrorHandling(withValidatedBody(AddTaskLinkSchema, async (req, { params }: { params: { tenantSlug: string; taskId: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const link = await addTaskLink(ctx, params.taskId, body.entityType, body.entityId, body.relation);
    return NextResponse.json(link, { status: 201 });
}));
