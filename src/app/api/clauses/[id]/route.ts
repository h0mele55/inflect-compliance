import { NextRequest, NextResponse } from 'next/server';
import { getLegacyCtx } from '@/app-layer/context';
import { updateClauseProgress } from '@/app-layer/usecases/clause';
import { withValidatedBody } from '@/lib/validation/route';
import { UpdateClauseProgressSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const PUT = withApiErrorHandling(withValidatedBody(UpdateClauseProgressSchema, async (req, { params }: { params: { id: string } }, body) => {
    const ctx = await getLegacyCtx(req);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await updateClauseProgress(ctx, params.id, body as any);
    return NextResponse.json<any>(result);
}));
