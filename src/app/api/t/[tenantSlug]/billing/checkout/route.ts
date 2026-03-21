import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
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
    const ctx = await getTenantCtx(params, req);

    // Admin-only guard
    if (ctx.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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

    return NextResponse.json({ url });
});
