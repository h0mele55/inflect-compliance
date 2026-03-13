import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { saveAssessmentAnswers } from '@/app-layer/usecases/vendor';
import { withValidatedBody } from '@/lib/validation/route';
import { SaveAssessmentAnswersSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const POST = withApiErrorHandling(withValidatedBody(SaveAssessmentAnswersSchema, async (req: NextRequest, { params }: { params: { tenantSlug: string; vendorId: string; assessmentId: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await saveAssessmentAnswers(ctx, params.assessmentId, body.answers as any);
    return NextResponse.json(result);
}));
