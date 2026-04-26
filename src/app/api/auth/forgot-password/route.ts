/**
 * POST /api/auth/forgot-password
 *
 * Initiates a password reset. Anti-enumeration: ALWAYS returns the same
 * 200 + body shape regardless of whether the email maps to a real user.
 * Timing convergence is enforced inside the usecase via a uniform floor.
 *
 * Rate limit: EMAIL_DISPATCH_LIMIT (5 / hour, per-IP). Per-IP not per-
 * email because per-email rate-limiting would itself become an
 * enumeration oracle (different errors for "you've been throttled" vs
 * "we don't know this email").
 */
import { NextRequest, NextResponse } from 'next/server';

import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { ForgotPasswordInput } from '@/app-layer/schemas/password.schemas';
import { requestPasswordReset } from '@/app-layer/usecases/password';
import { FORGOT_PASSWORD_LIMIT } from '@/lib/security/rate-limit';

function clientIp(req: NextRequest): string | null {
    const xff = req.headers.get('x-forwarded-for');
    if (xff) {
        const first = xff.split(',')[0]?.trim();
        if (first) return first;
    }
    const real = req.headers.get('x-real-ip');
    if (real) return real;
    return null;
}

export const POST = withApiErrorHandling(
    withValidatedBody(ForgotPasswordInput, async (req, _ctx, body) => {
        await requestPasswordReset({
            email: body.email,
            requestIp: clientIp(req),
        });

        // Uniform 200. Don't differentiate found vs unknown.
        return NextResponse.json({
            ok: true,
            message:
                'If an account with that email exists, we have sent a reset link. ' +
                'Please check your inbox (and spam folder). The link expires in 30 minutes.',
        });
    }),
    {
        rateLimit: {
            config: FORGOT_PASSWORD_LIMIT,
            scope: 'forgot-password',
        },
    },
);
