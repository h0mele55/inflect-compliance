import { NextRequest, NextResponse } from 'next/server';
import { requireAdminCtx } from '@/lib/auth/require-admin';
import { revokeUserSessions } from '@/app-layer/usecases/session-security';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { RevokeSessionsInput } from '@/app-layer/schemas/mfa.schemas';

/**
 * POST /api/t/[tenantSlug]/security/sessions/revoke-user
 *
 * Admin-only: revoke sessions for a specific user in this tenant.
 * Audit logging is handled by the session-security usecase.
 * Body: { targetUserId: "..." }
 */
export const POST = withApiErrorHandling(withValidatedBody(
    RevokeSessionsInput,
    async (req: NextRequest, { params }: { params: { tenantSlug: string } }, body) => {
        const ctx = await requireAdminCtx(params, req);

        if (!body.targetUserId) {
            return NextResponse.json<any>(
                { error: 'targetUserId is required' },
                { status: 400 },
            );
        }

        const result = await revokeUserSessions(ctx, body.targetUserId);

        return NextResponse.json<any>({
            success: true,
            message: 'User sessions revoked.',
            userId: result.userId,
            newSessionVersion: result.newSessionVersion,
        });
    },
));
