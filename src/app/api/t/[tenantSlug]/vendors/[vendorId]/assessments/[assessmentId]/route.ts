import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getVendorAssessment } from '@/app-layer/usecases/vendor';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; vendorId: string; assessmentId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const assessment = await getVendorAssessment(ctx, params.assessmentId);
    return NextResponse.json<any>(assessment);
});
