import { NextRequest, NextResponse } from 'next/server';
import { requireAdminCtx } from '@/lib/auth/require-admin';
import { withApiErrorHandling } from '@/lib/errors/api';
import { findOrCreateCustomer, createCheckoutSession } from '@/lib/stripe';
import { env } from '@/env';
import { z } from 'zod';

const CheckoutBody = z.object({
    plan: z.enum(['PRO', 'ENTERPRISE']),
});

/**
 * POST /api/t/[tenantSlug]/billing/checkout
 * Creates a Stripe Checkout Session for the given plan.
 * Admin-only.
 */
export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await requireAdminCtx(params, req);

    const body = CheckoutBody.parse(await req.json());
    const appUrl = env.APP_URL || `https://${req.headers.get('host') || 'localhost:3000'}`;

    // Find or create Stripe customer + BillingAccount
    const { stripeCustomerId } = await findOrCreateCustomer(
        ctx.tenantId,
        ctx.tenantSlug!, // always set in tenant-scoped routes
        '', // email resolved from session if needed
    );

    const url = await createCheckoutSession(
        stripeCustomerId,
        body.plan,
        `${appUrl}/t/${ctx.tenantSlug}/admin?billing=success`,
        `${appUrl}/t/${ctx.tenantSlug}/admin?billing=canceled`,
    );

    return NextResponse.json<any>({ url });
});
