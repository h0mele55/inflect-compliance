import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { verifyMfaEnrollment } from '@/app-layer/usecases/mfa-enrollment';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { VerifyMfaInput } from '@/app-layer/schemas/mfa.schemas';

/**
 * POST /api/t/[tenantSlug]/security/mfa/enroll/verify
 *
 * Verifies a TOTP code against the user's pending enrollment.
 * If valid, marks the enrollment as verified.
 *
 * Body: { code: "123456" }
 *
 * Returns:
 * - 200 { success: true } if code is valid and enrollment is verified
 * - 200 { success: false, error: "..." } if code is invalid
 * - 400 if no pending enrollment or already verified
 */
export const POST = withApiErrorHandling(withValidatedBody(
    VerifyMfaInput,
    async (req: NextRequest, { params }: { params: { tenantSlug: string } }, body) => {
        const ctx = await getTenantCtx(params, req);

        const result = await verifyMfaEnrollment(ctx, body);

        if (!result.success) {
            return NextResponse.json({
                success: false,
                error: 'Invalid TOTP code. Please try again.',
                enrollmentId: result.enrollmentId,
            });
        }

        return NextResponse.json({
            success: true,
            enrollmentId: result.enrollmentId,
            message: 'MFA enrollment verified successfully.',
        });
    },
));
