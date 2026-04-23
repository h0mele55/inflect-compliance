import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/security/permission-middleware';
import { deactivateTenantMember } from '@/app-layer/usecases/tenant-admin';
import { withApiErrorHandling } from '@/lib/errors/api';

export const POST = withApiErrorHandling(
    requirePermission<{ tenantSlug: string; membershipId: string }>(
        'admin.members',
        async (_req: NextRequest, { params }, ctx) => {
            const result = await deactivateTenantMember(ctx, {
                membershipId: params.membershipId,
            });
            return NextResponse.json<any>(result);
        },
    ),
);
