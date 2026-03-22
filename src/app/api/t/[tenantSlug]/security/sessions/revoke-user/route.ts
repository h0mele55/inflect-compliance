import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { revokeUserSessions } from '@/app-layer/usecases/session-security';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { RevokeSessionsInput } from '@/app-layer/schemas/mfa.schemas';
import { logEvent } from '@/app-layer/events/audit';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/t/[tenantSlug]/security/sessions/revoke-user
 *
 * Admin-only: revoke sessions for a specific user in this tenant.
 * Body: { targetUserId: "..." }
 */
export const POST = withApiErrorHandling(withValidatedBody(
    RevokeSessionsInput,
    async (req: NextRequest, { params }: { params: { tenantSlug: string } }, body) => {
        const ctx = await getTenantCtx(params, req);

        if (!body.targetUserId) {
            return NextResponse.json(
                { error: 'targetUserId is required' },
                { status: 400 },
            );
        }

        const result = await revokeUserSessions(ctx, body.targetUserId);

        // Audit trail
        await logEvent(prisma, ctx, {
            action: 'SESSIONS_REVOKED_FOR_USER',
            entityType: 'User',
            entityId: body.targetUserId,
            details: `Admin ${ctx.userId} revoked sessions for user ${body.targetUserId}. New sessionVersion: ${result.newSessionVersion}`,
        });

        return NextResponse.json({
            success: true,
            message: 'User sessions revoked.',
            userId: result.userId,
            newSessionVersion: result.newSessionVersion,
        });
    },
));
