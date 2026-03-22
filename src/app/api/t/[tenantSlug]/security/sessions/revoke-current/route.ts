import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { revokeCurrentSession, revokeUserSessions, revokeAllTenantSessions } from '@/app-layer/usecases/session-security';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { SessionRevocationInput } from '@/app-layer/schemas/mfa.schemas';
import { logEvent } from '@/app-layer/events/audit';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/t/[tenantSlug]/security/sessions/revoke-current
 *
 * Revokes the current user's own sessions.
 * After this call, the user's JWT tokens become invalid
 * and they will need to re-authenticate.
 */
export const POST = withApiErrorHandling(async (
    req: NextRequest,
    { params }: { params: { tenantSlug: string } },
) => {
    const ctx = await getTenantCtx(params, req);
    const result = await revokeCurrentSession(ctx);

    // Audit trail
    await logEvent(prisma, ctx, {
        action: 'CURRENT_SESSION_REVOKED',
        entityType: 'User',
        entityId: ctx.userId,
        details: `User revoked their own sessions. New sessionVersion: ${result.newSessionVersion}`,
    });

    return NextResponse.json({
        success: true,
        message: 'All your sessions have been revoked. You will need to sign in again.',
        userId: result.userId,
        newSessionVersion: result.newSessionVersion,
    });
});
