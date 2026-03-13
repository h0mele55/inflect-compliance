import { NextRequest, NextResponse } from 'next/server';
import { getLegacyCtx } from '@/app-layer/context';
import { listEvidence, createEvidence } from '@/app-layer/usecases/evidence';
import { withValidatedForm } from '@/lib/validation/route';
import { CreateEvidenceFormSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest) => {
    const ctx = await getLegacyCtx(req);
    const evidence = await listEvidence(ctx);
    return NextResponse.json(evidence);
});

export const POST = withApiErrorHandling(withValidatedForm(CreateEvidenceFormSchema, async (req, _ctx, body) => {
    const ctx = await getLegacyCtx(req);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item = await createEvidence(ctx, body as any);
    return NextResponse.json(item, { status: 201 });
}));
