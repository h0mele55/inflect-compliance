import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { bulkAssignTasks } from '@/app-layer/usecases/task';
import { withValidatedBody } from '@/lib/validation/route';
import { BulkTaskAssignSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const POST = withApiErrorHandling(
    withValidatedBody(
        BulkTaskAssignSchema,
        async (
            req: NextRequest,
            { params }: { params: { tenantSlug: string } },
            body,
        ) => {
            const ctx = await getTenantCtx(params, req);
            const result = await bulkAssignTasks(
                ctx,
                body.taskIds,
                body.assigneeUserId,
            );
            return jsonResponse(result);
        },
    ),
);
