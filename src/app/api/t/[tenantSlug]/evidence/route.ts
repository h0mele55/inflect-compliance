import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listEvidence, listEvidencePaginated, createEvidence, listEvidenceWithDeleted } from '@/app-layer/usecases/evidence';
import { withValidatedBody } from '@/lib/validation/route';
import { CreateEvidenceSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { z } from 'zod';
import { normalizeQ } from '@/lib/filters/query-helpers';

const EvidenceQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
    type: z.string().optional(),
    controlId: z.string().optional(),
    q: z.string().optional().transform(normalizeQ),
    archived: z.enum(['true', 'false']).optional(),
    expiring: z.enum(['true', 'false']).optional(),
    includeDeleted: z.enum(['true', 'false']).optional(),
}).strip();

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
    const query = EvidenceQuerySchema.parse(sp);

    if (query.includeDeleted === 'true') {
        const evidence = await listEvidenceWithDeleted(ctx);
        return NextResponse.json(evidence);
    }

    const filters = {
        type: query.type,
        controlId: query.controlId,
        q: query.q,
        archived: query.archived === 'true' ? true : query.archived === 'false' ? false : undefined,
        expiring: query.expiring === 'true',
    };

    // If pagination params present, use paginated response
    if (query.limit !== undefined || query.cursor !== undefined) {
        const result = await listEvidencePaginated(ctx, {
            limit: query.limit,
            cursor: query.cursor,
            filters,
        });
        return NextResponse.json(result);
    }

    // Backward compatibility: flat array
    const evidence = await listEvidence(ctx, filters);
    return NextResponse.json(evidence);
});

export const POST = withApiErrorHandling(withValidatedBody(CreateEvidenceSchema, async (req, { params }: { params: { tenantSlug: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evidence = await createEvidence(ctx, body as any);
    return NextResponse.json(evidence, { status: 201 });
}));
