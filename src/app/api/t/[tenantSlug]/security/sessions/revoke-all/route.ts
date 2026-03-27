import { NextRequest, NextResponse } from 'next/server';
import { requireAdminCtx } from '@/lib/auth/require-admin';
import { revokeAllTenantSessions } from '@/app-layer/usecases/session-security';
import { withApiErrorHandling } from '@/lib/errors/api';

/**
 * POST /api/t/[tenantSlug]/security/sessions/revoke-all
 *
 * Admin-only: revoke sessions for ALL users in this tenant.
 * Audit logging is handled by the session-security usecase.
 */
export const POST = withApiErrorHandling(async (
    req: NextRequest,
    { params }: { params: { tenantSlug: string } },
) => {
    const ctx = await requireAdminCtx(params, req);
    const result = await revokeAllTenantSessions(ctx);

    return NextResponse.json({
        success: true,
        message: `Sessions revoked for ${result.usersAffected} users.`,
        usersAffected: result.usersAffected,
    });
});
