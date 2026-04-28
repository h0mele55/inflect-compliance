import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getVendorAssessment } from '@/app-layer/usecases/vendor';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; vendorId: string; assessmentId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const assessment = await getVendorAssessment(ctx, params.assessmentId);
    return jsonResponse(assessment);
});
