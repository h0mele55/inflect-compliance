import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { bulkSetTaskDueDate } from '@/app-layer/usecases/task';
import { withValidatedBody } from '@/lib/validation/route';
import { BulkTaskDueDateSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const POST = withApiErrorHandling(
    withValidatedBody(
        BulkTaskDueDateSchema,
        async (
            req: NextRequest,
            { params }: { params: { tenantSlug: string } },
            body,
        ) => {
            const ctx = await getTenantCtx(params, req);
            const result = await bulkSetTaskDueDate(
                ctx,
                body.taskIds,
                body.dueAt,
            );
            return jsonResponse(result);
        },
    ),
);
