/**
 * POST /api/auth/reset-password
 *
 * Consume a password-reset token and set a new password.
 *
 *   - 200 ok          → password updated, every existing JWT killed,
 *                        user must sign in fresh.
 *   - 400 bad_request → policy reject or HIBP-breached choice; the same
 *                        token can be used to retry with a different
 *                        password.
 *   - 410 gone        → token is invalid, expired, or already used.
 *
 * Rate limit: LOGIN_LIMIT (10/15min + 15min lockout after exhaustion),
 * scoped 'reset-password', keyed by IP. The token itself is 256-bit so
 * brute-force is infeasible at the entropy layer; the rate limiter is
 * defence-in-depth against scanning patterns and accidental floods.
 *
 * HIBP: invoked here for early reject (cheaper than burning the token
 * claim). The usecase calls HIBP again as a backstop so direct callers
 * (tests, future admin-driven flows) can't bypass the breach screen.
 */
import { NextResponse } from 'next/server';

import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { ResetPasswordInput } from '@/app-layer/schemas/password.schemas';
import { consumePasswordReset } from '@/app-layer/usecases/password';
import { PASSWORD_RESET_LIMIT } from '@/lib/security/rate-limit';
import { checkPasswordAgainstHIBP } from '@/lib/security/password-check';

export const POST = withApiErrorHandling(
    withValidatedBody(ResetPasswordInput, async (_req, _ctx, body) => {
        // Early HIBP reject — saves a token-claim round trip on a known-bad
        // choice. Fail-open on HIBP outage; the usecase will run its own
        // check on the same input.
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

        const result = await consumePasswordReset({
            token: body.token,
            newPassword: body.newPassword,
        });

        if (result.ok) {
            return NextResponse.json({
                ok: true,
                message:
                    'Your password has been updated. For security, all of your existing sessions have been signed out. Please sign in with your new password.',
            });
        }

        return NextResponse.json(
            { ok: false, error: result.message, reason: result.reason },
            { status: result.status },
        );
    }),
    {
        rateLimit: {
            config: PASSWORD_RESET_LIMIT,
            scope: 'reset-password',
        },
    },
);
