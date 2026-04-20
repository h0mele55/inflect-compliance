import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { startVendorAssessment } from '@/app-layer/usecases/vendor';
import { withValidatedBody } from '@/lib/validation/route';
import { StartAssessmentSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const POST = withApiErrorHandling(withValidatedBody(StartAssessmentSchema, async (req: NextRequest, { params }: { params: { tenantSlug: string; vendorId: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const assessment = await startVendorAssessment(ctx, params.vendorId, body.templateKey);
    return NextResponse.json<any>(assessment, { status: 201 });
}));
