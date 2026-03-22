import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { decryptTotpSecret, verifyTotpCode } from '@/lib/security/totp-crypto';
import { VerifyMfaInput } from '@/app-layer/schemas/mfa.schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { checkRateLimit, resetRateLimit, MFA_VERIFY_LIMIT } from '@/lib/security/rate-limit';
import { logEvent } from '@/app-layer/events/audit';

/**
 * POST /api/t/[tenantSlug]/security/mfa/challenge/verify
 *
 * Verifies a TOTP code during the MFA challenge (login flow).
 * On success, clears the mfaPending flag by updating lastChallengeAt.
 *
 * Hardened with:
 * - Rate limiting (5 attempts per 15 min, 5 min lockout)
 * - Audit logging (MFA_CHALLENGE_PASSED / MFA_CHALLENGE_FAILED)
 * - Generic error messages (no enumeration)
 *
 * Body: { code: "123456" }
 */
export const POST = withApiErrorHandling(async (
    req: NextRequest,
) => {
    // Get current session
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userId = session.user.id;
    const tenantId = session.user.tenantId;

    if (!tenantId) {
        return NextResponse.json({ error: 'No tenant context' }, { status: 400 });
    }

    // ── Rate Limit Check ────────────────────────────────────────────
    const rateLimitKey = `mfa-challenge:${userId}`;
    const rateCheck = checkRateLimit(rateLimitKey, MFA_VERIFY_LIMIT);

    if (!rateCheck.allowed) {
        const retrySeconds = Math.ceil(rateCheck.retryAfterMs / 1000);
        return NextResponse.json(
            {
                success: false,
                error: `Too many verification attempts. Please try again in ${retrySeconds} seconds.`,
                retryAfterMs: rateCheck.retryAfterMs,
            },
            { status: 429 },
        );
    }

    // Parse body
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const parsed = VerifyMfaInput.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Invalid code format' },
            { status: 400 },
        );
    }

    // Look up enrollment
    const enrollment = await prisma.userMfaEnrollment.findUnique({
        where: {
            userId_tenantId_type: {
                userId,
                tenantId,
                type: 'TOTP',
            },
        },
    });

    if (!enrollment || !enrollment.isVerified) {
        return NextResponse.json(
            { error: 'MFA not configured. Please set up MFA first.' },
            { status: 400 },
        );
    }

    // Decrypt and verify
    const authSecret = process.env.AUTH_SECRET;
    if (!authSecret) {
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const secret = decryptTotpSecret(enrollment.secretEncrypted, authSecret);
    const isValid = verifyTotpCode(secret, parsed.data.code);

    if (!isValid) {
        // Audit: failed challenge
        try {
            await logEvent(prisma, {
                tenantId,
                userId,
                role: 'READER' as const,
                permissions: { canAdmin: false, canWrite: false, canRead: true, canAudit: false, canExport: false },
                requestId: crypto.randomUUID(),
            }, {
                action: 'MFA_CHALLENGE_FAILED',
                entityType: 'User',
                entityId: userId,
                details: `MFA challenge failed. ${rateCheck.remaining} attempts remaining.`,
            });
        } catch { /* audit is best-effort */ }

        return NextResponse.json({
            success: false,
            error: 'Invalid code. Please check your authenticator app and try again.',
            remaining: rateCheck.remaining,
        });
    }

    // ── Success ─────────────────────────────────────────────────────
    // Reset rate limit on success
    resetRateLimit(rateLimitKey);

    // Update lastChallengeAt — JWT callback will detect this and clear mfaPending
    await prisma.userMfaEnrollment.update({
        where: { id: enrollment.id },
        data: { lastChallengeAt: new Date() },
    });

    // Audit: passed challenge
    try {
        await logEvent(prisma, {
            tenantId,
            userId,
            role: 'READER' as const,
            permissions: { canAdmin: false, canWrite: false, canRead: true, canAudit: false, canExport: false },
            requestId: crypto.randomUUID(),
        }, {
            action: 'MFA_CHALLENGE_PASSED',
            entityType: 'User',
            entityId: userId,
            details: 'MFA challenge passed successfully.',
        });
    } catch { /* audit is best-effort */ }

    const response = NextResponse.json({
        success: true,
        message: 'MFA verification successful',
    });

    // Set mfa-cleared cookie for JWT callback to detect
    response.cookies.set('mfa-cleared', userId, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 300,
        secure: process.env.NODE_ENV === 'production',
    });

    return response;
});
