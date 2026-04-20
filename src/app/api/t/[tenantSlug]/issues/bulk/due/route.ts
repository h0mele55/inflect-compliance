import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { bulkSetDueDate } from '@/app-layer/usecases/issue';
import { withValidatedBody } from '@/lib/validation/route';
import { BulkDueDateSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const POST = withApiErrorHandling(withValidatedBody(BulkDueDateSchema, async (req: NextRequest, { params }: { params: { tenantSlug: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const result = await bulkSetDueDate(ctx, body.taskIds, body.dueAt);
    return NextResponse.json<any>({ updated: result.count });
}));
