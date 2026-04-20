import { NextRequest, NextResponse } from 'next/server';
import { getLegacyCtx } from '@/app-layer/context';
import { getEvidence, updateEvidence } from '@/app-layer/usecases/evidence';
import { withValidatedBody } from '@/lib/validation/route';
import { UpdateEvidenceSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { id: string } }) => {
    const ctx = await getLegacyCtx(req);
    const evidence = await getEvidence(ctx, params.id);
    return NextResponse.json<any>(evidence);
});

export const PUT = withApiErrorHandling(withValidatedBody(UpdateEvidenceSchema, async (req, { params }: { params: { id: string } }, body) => {
    const ctx = await getLegacyCtx(req);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evidence = await updateEvidence(ctx, params.id, body as any);
    return NextResponse.json<any>({ success: true, evidence });
}));
