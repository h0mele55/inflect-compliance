import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getQuestionnaireTemplate } from '@/app-layer/usecases/vendor';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; templateKey: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const template = await getQuestionnaireTemplate(ctx, params.templateKey);
    return NextResponse.json<any>(template);
});
