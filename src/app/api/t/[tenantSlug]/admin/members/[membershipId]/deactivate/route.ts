import { NextRequest, NextResponse } from 'next/server';
import { requireAdminCtx } from '@/lib/auth/require-admin';
import { deactivateTenantMember } from '@/app-layer/usecases/tenant-admin';
import { withApiErrorHandling } from '@/lib/errors/api';

export const POST = withApiErrorHandling(async (
    req: NextRequest,
    { params }: { params: { tenantSlug: string; membershipId: string } }
) => {
    const ctx = await requireAdminCtx(params, req);
    const result = await deactivateTenantMember(ctx, {
        membershipId: params.membershipId,
    });
    return NextResponse.json(result);
});
