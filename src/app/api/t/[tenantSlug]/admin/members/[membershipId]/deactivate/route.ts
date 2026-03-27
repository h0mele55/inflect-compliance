import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { deactivateTenantMember } from '@/app-layer/usecases/tenant-admin';
import { withApiErrorHandling } from '@/lib/errors/api';

export const POST = withApiErrorHandling(async (
    req: NextRequest,
    { params }: { params: { tenantSlug: string; membershipId: string } }
) => {
    const ctx = await getTenantCtx(params, req);
    const result = await deactivateTenantMember(ctx, {
        membershipId: params.membershipId,
    });
    return NextResponse.json(result);
});
