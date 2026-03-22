import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { decryptTotpSecret, verifyTotpCode } from '@/lib/security/totp-crypto';
import { VerifyMfaInput } from '@/app-layer/schemas/mfa.schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

/**
 * POST /api/t/[tenantSlug]/security/mfa/challenge/verify
 *
 * Verifies a TOTP code during the MFA challenge (login flow).
 * On success, clears the mfaPending flag by triggering a session update.
 *
 * This is distinct from the enrollment verify endpoint:
 * - enrollment/verify: first-time setup verification
 * - challenge/verify: login-time challenge for enrolled users
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

    // Parse body
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = VerifyMfaInput.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Invalid code format', details: parsed.error.flatten() },
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
            { error: 'No verified MFA enrollment found' },
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
        return NextResponse.json({
            success: false,
            error: 'Invalid TOTP code',
        });
    }

    // MFA challenge passed — update session to clear mfaPending.
    // Since we use JWT sessions, we increment sessionVersion by 0 (noop DB write)
    // to force token refresh on next request, which will re-evaluate mfaPending.
    // Actually, we need a mechanism to clear mfaPending in the token.
    // The cleanest approach: set a server-side MFA completion marker that
    // the JWT callback can check. We'll use a cookie with a signed challenge token.
    //
    // Alternative: store the MFA completion timestamp on the enrollment record,
    // and have the JWT callback check it on subsequent requests.
    await prisma.userMfaEnrollment.update({
        where: { id: enrollment.id },
        data: { lastChallengeAt: new Date() },
    });

    // Set a short-lived MFA-cleared cookie that the JWT callback can detect.
    // This cookie signals that MFA was just completed for this session.
    const response = NextResponse.json({
        success: true,
        message: 'MFA verification successful',
    });

    // Set mfa-cleared cookie (httpOnly, same-site, 5 min expiry for the callback to pick up)
    response.cookies.set('mfa-cleared', userId, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 300, // 5 minutes — enough for the JWT callback to refresh
        secure: process.env.NODE_ENV === 'production',
    });

    return response;
});
