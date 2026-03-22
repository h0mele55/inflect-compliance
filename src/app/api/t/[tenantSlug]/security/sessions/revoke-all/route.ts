import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
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
    const ctx = await getTenantCtx(params, req);
    const result = await revokeAllTenantSessions(ctx);

    return NextResponse.json({
        success: true,
        message: `Sessions revoked for ${result.usersAffected} users.`,
        usersAffected: result.usersAffected,
    });
});
