import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getTenantSecuritySettings, updateTenantMfaPolicy } from '@/app-layer/usecases/mfa';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { UpdateMfaPolicyInput } from '@/app-layer/schemas/mfa.schemas';

/**
 * GET /api/t/[tenantSlug]/security/mfa/policy
 *
 * Returns the current MFA policy and session settings for the tenant.
 */
export const GET = withApiErrorHandling(async (
    req: NextRequest,
    { params }: { params: { tenantSlug: string } },
) => {
    const ctx = await getTenantCtx(params, req);
    const settings = await getTenantSecuritySettings(ctx);
    return NextResponse.json(settings);
});

/**
 * PUT /api/t/[tenantSlug]/security/mfa/policy
 *
 * Updates the MFA policy for the tenant. ADMIN-only.
 */
export const PUT = withApiErrorHandling(withValidatedBody(
    UpdateMfaPolicyInput,
    async (req: NextRequest, { params }: { params: { tenantSlug: string } }, body) => {
        const ctx = await getTenantCtx(params, req);
        const result = await updateTenantMfaPolicy(ctx, body);
        return NextResponse.json(result);
    },
));
