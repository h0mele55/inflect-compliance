import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { bulkSetStatus } from '@/app-layer/usecases/issue';
import { withValidatedBody } from '@/lib/validation/route';
import { BulkStatusSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const POST = withApiErrorHandling(withValidatedBody(BulkStatusSchema, async (req: NextRequest, { params }: { params: { tenantSlug: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const result = await bulkSetStatus(ctx, body.taskIds, body.status, body.resolution);
    return NextResponse.json<any>({ updated: result.count });
}));
