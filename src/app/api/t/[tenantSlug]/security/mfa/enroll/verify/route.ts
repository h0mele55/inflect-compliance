import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { verifyMfaEnrollment } from '@/app-layer/usecases/mfa-enrollment';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { VerifyMfaInput } from '@/app-layer/schemas/mfa.schemas';
import { checkRateLimit, resetRateLimit, MFA_ENROLL_VERIFY_LIMIT } from '@/lib/security/rate-limit';
import { logEvent } from '@/app-layer/events/audit';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/t/[tenantSlug]/security/mfa/enroll/verify
 *
 * Verifies a TOTP code against the user's pending enrollment.
 * If valid, marks the enrollment as verified.
 *
 * Hardened with rate limiting (10 attempts per 15 min).
 *
 * Body: { code: "123456" }
 */
export const POST = withApiErrorHandling(withValidatedBody(
    VerifyMfaInput,
    async (req: NextRequest, { params }: { params: { tenantSlug: string } }, body) => {
        const ctx = await getTenantCtx(params, req);

        // Rate limit check
        const rateLimitKey = `mfa-enroll:${ctx.userId}`;
        const rateCheck = checkRateLimit(rateLimitKey, MFA_ENROLL_VERIFY_LIMIT);

        if (!rateCheck.allowed) {
            const retrySeconds = Math.ceil(rateCheck.retryAfterMs / 1000);
            return NextResponse.json(
                {
                    success: false,
                    error: `Too many attempts. Please try again in ${retrySeconds} seconds.`,
                },
                { status: 429 },
            );
        }

        const result = await verifyMfaEnrollment(ctx, body);

        if (!result.success) {
            // Audit: enrollment verification failed
            try {
                await logEvent(prisma, ctx, {
                    action: 'MFA_ENROLLMENT_VERIFY_FAILED',
                    entityType: 'User',
                    entityId: ctx.userId,
                    details: `Enrollment verification failed. ${rateCheck.remaining} attempts remaining.`,
                });
            } catch { /* best-effort */ }

            return NextResponse.json({
                success: false,
                error: 'Invalid TOTP code. Please try again.',
                enrollmentId: result.enrollmentId,
            });
        }

        // Success — reset rate limit
        resetRateLimit(rateLimitKey);

        // Audit: enrollment verified
        try {
            await logEvent(prisma, ctx, {
                action: 'MFA_ENROLLED',
                entityType: 'User',
                entityId: ctx.userId,
                details: 'MFA enrollment verified and activated.',
            });
        } catch { /* best-effort */ }

        return NextResponse.json({
            success: true,
            enrollmentId: result.enrollmentId,
            message: 'MFA enrollment verified successfully.',
        });
    },
));
