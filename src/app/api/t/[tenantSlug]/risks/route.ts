import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listRisks, createRisk, listRisksWithDeleted } from '@/app-layer/usecases/risk';
import { withValidatedBody } from '@/lib/validation/route';
import { CreateRiskSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const includeDeleted = req.nextUrl.searchParams.get('includeDeleted') === 'true';
    const risks = includeDeleted ? await listRisksWithDeleted(ctx) : await listRisks(ctx);
    return NextResponse.json(risks);
});

export const POST = withApiErrorHandling(withValidatedBody(CreateRiskSchema, async (req, { params }: { params: { tenantSlug: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const risk = await createRisk(ctx, body as any);
    return NextResponse.json(risk, { status: 201 });
}));
