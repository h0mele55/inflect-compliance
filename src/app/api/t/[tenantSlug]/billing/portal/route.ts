import { NextRequest, NextResponse } from 'next/server';
import { requireAdminCtx } from '@/lib/auth/require-admin';
import { withApiErrorHandling } from '@/lib/errors/api';
import { findOrCreateCustomer, createPortalSession } from '@/lib/stripe';
import { env } from '@/env';

/**
 * POST /api/t/[tenantSlug]/billing/portal
 * Creates a Stripe Customer Portal session.
 * Admin-only.
 */
export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await requireAdminCtx(params, req);

    const appUrl = env.APP_URL || `https://${req.headers.get('host') || 'localhost:3000'}`;

    const { stripeCustomerId } = await findOrCreateCustomer(
        ctx.tenantId,
        ctx.tenantSlug!,
        '',
    );

    const url = await createPortalSession(
        stripeCustomerId,
        `${appUrl}/t/${ctx.tenantSlug}/admin`,
    );

    return NextResponse.json({ url });
});
