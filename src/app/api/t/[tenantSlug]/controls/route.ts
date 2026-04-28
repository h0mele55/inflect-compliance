import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listControls, listControlsPaginated, createControl, listControlsWithDeleted } from '@/app-layer/usecases/control';
import { withValidatedBody } from '@/lib/validation/route';
import { CreateControlSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { z } from 'zod';
import { normalizeQ } from '@/lib/filters/query-helpers';
import { jsonResponse } from '@/lib/api-response';

const ControlsQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
    status: z.string().optional(),
    applicability: z.enum(['APPLICABLE', 'NOT_APPLICABLE']).optional(),
    ownerUserId: z.string().optional(),
    q: z.string().optional().transform(normalizeQ),
    category: z.string().optional(),
    includeDeleted: z.enum(['true', 'false']).optional(),
}).strip();

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
    const query = ControlsQuerySchema.parse(sp);

    if (query.includeDeleted === 'true') {
        const controls = await listControlsWithDeleted(ctx);
        return jsonResponse(controls);
    }

    const filters = {
        status: query.status,
        applicability: query.applicability,
        ownerUserId: query.ownerUserId,
        q: query.q,
        category: query.category,
    };

    // If pagination params present, use paginated response
    if (query.limit !== undefined || query.cursor !== undefined) {
        const result = await listControlsPaginated(ctx, {
            limit: query.limit,
            cursor: query.cursor,
            filters,
        });
        return jsonResponse(result);
    }

    // Backward compatibility: flat array
    const controls = await listControls(ctx, filters);
    return jsonResponse(controls);
});

export const POST = withApiErrorHandling(withValidatedBody(CreateControlSchema, async (req, { params }: { params: { tenantSlug: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const control = await createControl(ctx, body);
    return jsonResponse(control, { status: 201 });
}));
