import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { revokeAllTenantSessions } from '@/app-layer/usecases/session-security';
import { withApiErrorHandling } from '@/lib/errors/api';
import { logEvent } from '@/app-layer/events/audit';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/t/[tenantSlug]/security/sessions/revoke-all
 *
 * Admin-only: revoke sessions for ALL users in this tenant.
 * Use after a security incident to force everyone to re-authenticate.
 */
export const POST = withApiErrorHandling(async (
    req: NextRequest,
    { params }: { params: { tenantSlug: string } },
) => {
    const ctx = await getTenantCtx(params, req);
    const result = await revokeAllTenantSessions(ctx);

    // Audit trail
    await logEvent(prisma, ctx, {
        action: 'ALL_TENANT_SESSIONS_REVOKED',
        entityType: 'Tenant',
        entityId: ctx.tenantId,
        details: `Admin ${ctx.userId} revoked sessions for ${result.usersAffected} users in tenant.`,
    });

    return NextResponse.json({
        success: true,
        message: `Sessions revoked for ${result.usersAffected} users.`,
        usersAffected: result.usersAffected,
    });
});
