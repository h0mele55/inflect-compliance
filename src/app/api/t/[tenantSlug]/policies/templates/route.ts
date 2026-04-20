import { NextRequest, NextResponse } from 'next/server';
import { withApiErrorHandling } from '@/lib/errors/api';
import { getTenantCtx } from '@/app-layer/context';
import * as policyUsecases from '@/app-layer/usecases/policy';

// GET /api/t/[tenantSlug]/policies/templates — list global templates
export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const templates = await policyUsecases.listPolicyTemplates(ctx);
    return NextResponse.json<any>(templates);
});
