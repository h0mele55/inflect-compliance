/**
 * PUT /api/t/[tenantSlug]/account/password
 *
 * Authenticated password change. Self-service: any active tenant member
 * can change their own password — no admin gate. The path is tenant-
 * scoped because the UI lives at `/t/:slug/account/...`, but the
 * underlying password is user-scoped (one password authenticates the
 * user across every tenant they belong to).
 *
 * Flow:
 *   1. Resolve tenant ctx (validates membership)
 *   2. Read userSessionId from JWT (preserved across the change for UX)
 *   3. Verify current password (progressive lockout on failure)
 *   4. Validate new password policy + reject same-as-current
 *   5. HIBP screen
 *   6. Update User.passwordHash + passwordChangedAt
 *   7. Bump sessionVersion + revoke OTHER UserSessions (current preserved)
 *   8. Invalidate any outstanding reset tokens (defence-in-depth)
 *   9. Audit: AUTH_PASSWORD_CHANGED
 *
 * Rate limit: LOGIN_LIMIT keyed by userId (10/15min + 15min lockout).
 * Plus per-user progressive policy on wrong-current attempts inside the
 * usecase (3→5s, 5→30s, 10→15min).
 *
 * HIBP: invoked here for early reject; usecase calls it again as backstop.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { ChangePasswordInput } from '@/app-layer/schemas/password.schemas';
import { changeAuthenticatedPassword } from '@/app-layer/usecases/password';
import { getTenantCtx } from '@/app-layer/context';
import { PASSWORD_CHANGE_LIMIT } from '@/lib/security/rate-limit';
import { checkPasswordAgainstHIBP } from '@/lib/security/password-check';
import { env } from '@/env';

interface RouteCtx {
    params: { tenantSlug: string };
}

async function readUserSessionId(req: NextRequest): Promise<string | null> {
    try {
        const token = await getToken({
            req,
            secret: env.AUTH_SECRET,
        });
        if (token && typeof token.userSessionId === 'string' && token.userSessionId) {
            return token.userSessionId;
        }
    } catch {
        // No JWT or signature mismatch — fall through. revokeOtherUserSessions
        // will revoke everything if the current id is null, which is the
        // correct conservative behaviour.
    }
    return null;
}

export const PUT = withApiErrorHandling(
    withValidatedBody(
        ChangePasswordInput,
        async (req: NextRequest, routeCtx: RouteCtx, body) => {
            const ctx = await getTenantCtx(routeCtx.params, req);
            const currentUserSessionId = await readUserSessionId(req);

            // Early HIBP reject. Mirrors register/route.ts; usecase
            // performs the same check as a backstop for direct callers.
            const hibp = await checkPasswordAgainstHIBP(body.newPassword);
            if (hibp.breached) {
                return NextResponse.json(
                    {
                        ok: false,
                        error:
                            'This password appears in known data breaches. Please choose a different password.',
                        reason: 'breached_password',
                    },
                    { status: 400 },
                );
            }

            const result = await changeAuthenticatedPassword(ctx, {
                currentPassword: body.currentPassword,
                newPassword: body.newPassword,
                currentUserSessionId,
                requestId: ctx.requestId,
            });

            if (result.ok) {
                return NextResponse.json({
                    ok: true,
                    message:
                        'Your password has been updated. Other devices have been signed out; this device remains signed in.',
                });
            }

            const headers: Record<string, string> = {};
            if (result.status === 429 && 'retryAfterSeconds' in result) {
                headers['Retry-After'] = String(result.retryAfterSeconds);
            }

            return NextResponse.json(
                { ok: false, error: result.message, reason: result.reason },
                { status: result.status, headers },
            );
        },
    ),
    {
        rateLimit: {
            config: PASSWORD_CHANGE_LIMIT,
            scope: 'change-password',
            // Authenticated route — key the per-IP limiter by user too,
            // so a shared-NAT office doesn't trigger another user's quota.
            getUserId: async (req: NextRequest) => {
                try {
                    const token = await getToken({
                        req,
                        secret: env.AUTH_SECRET,
                    });
                    return typeof token?.userId === 'string' ? token.userId : null;
                } catch {
                    return null;
                }
            },
        },
    },
);
