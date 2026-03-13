import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listEvidence, createEvidence, listEvidenceWithDeleted } from '@/app-layer/usecases/evidence';
import { withValidatedForm } from '@/lib/validation/route';
import { CreateEvidenceFormSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const includeDeleted = req.nextUrl.searchParams.get('includeDeleted') === 'true';
    const evidence = includeDeleted ? await listEvidenceWithDeleted(ctx) : await listEvidence(ctx);
    return NextResponse.json(evidence);
});

export const POST = withApiErrorHandling(withValidatedForm(CreateEvidenceFormSchema, async (req, { params }: { params: { tenantSlug: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evidence = await createEvidence(ctx, body as any);
    return NextResponse.json(evidence, { status: 201 });
}));
