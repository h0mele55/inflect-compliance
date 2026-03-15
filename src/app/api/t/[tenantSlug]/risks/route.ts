import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listRisks, listRisksPaginated, createRisk, listRisksWithDeleted } from '@/app-layer/usecases/risk';
import { withValidatedBody } from '@/lib/validation/route';
import { CreateRiskSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { z } from 'zod';
import { normalizeQ } from '@/lib/filters/query-helpers';

const RiskQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
    status: z.string().optional(),
    scoreMin: z.coerce.number().int().min(0).optional(),
    scoreMax: z.coerce.number().int().min(0).optional(),
    category: z.string().optional(),
    ownerUserId: z.string().optional(),
    q: z.string().optional().transform(normalizeQ),
    includeDeleted: z.enum(['true', 'false']).optional(),
}).strip();

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
    const query = RiskQuerySchema.parse(sp);

    if (query.includeDeleted === 'true') {
        const risks = await listRisksWithDeleted(ctx);
        return NextResponse.json(risks);
    }

    const hasPagination = query.limit || query.cursor;
    if (hasPagination) {
        const result = await listRisksPaginated(ctx, {
            limit: query.limit,
            cursor: query.cursor,
            filters: {
                status: query.status,
                scoreMin: query.scoreMin,
                scoreMax: query.scoreMax,
                category: query.category,
                ownerUserId: query.ownerUserId,
                q: query.q,
            },
        });
        return NextResponse.json(result);
    }

    // Backward compat: return flat array
    const risks = await listRisks(ctx, {
        status: query.status,
        scoreMin: query.scoreMin,
        scoreMax: query.scoreMax,
        category: query.category,
        ownerUserId: query.ownerUserId,
        q: query.q,
    });
    return NextResponse.json(risks);
});

export const POST = withApiErrorHandling(withValidatedBody(CreateRiskSchema, async (req, { params }: { params: { tenantSlug: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const risk = await createRisk(ctx, body as any);
    return NextResponse.json(risk, { status: 201 });
}));
