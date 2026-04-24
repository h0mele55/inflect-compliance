/**
 * /api/t/:slug/admin/invites/:inviteId
 *
 * DELETE — revoke a pending invite.
 *
 * Requires admin.members permission.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/security/permission-middleware';
import { revokeInvite } from '@/app-layer/usecases/tenant-invites';
import { withApiErrorHandling } from '@/lib/errors/api';

export const DELETE = withApiErrorHandling(
    requirePermission<{ tenantSlug: string; inviteId: string }>(
        'admin.members',
        async (_req: NextRequest, { params }, ctx) => {
            await revokeInvite(ctx, { inviteId: params.inviteId });
            return new NextResponse(null, { status: 204 });
        },
    ),
);
