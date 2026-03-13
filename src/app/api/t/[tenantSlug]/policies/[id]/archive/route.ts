import { NextRequest, NextResponse } from 'next/server';
import { withApiErrorHandling } from '@/lib/errors/api';
import { getTenantCtx } from '@/app-layer/context';
import * as policyUsecases from '@/app-layer/usecases/policy';

// POST /api/t/[tenantSlug]/policies/[id]/archive — archive policy (ADMIN)
export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; id: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const result = await policyUsecases.archivePolicy(ctx, params.id);
    return NextResponse.json(result);
});
