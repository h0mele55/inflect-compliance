import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/security/permission-middleware';
import { withApiErrorHandling } from '@/lib/errors/api';
import { findOrCreateCustomer, createCheckoutSession } from '@/lib/stripe';
import { env } from '@/env';
import { z } from 'zod';
import { jsonResponse } from '@/lib/api-response';

const CheckoutBody = z.object({
    plan: z.enum(['PRO', 'ENTERPRISE']),
});

/**
 * POST /api/t/[tenantSlug]/billing/checkout
 * Creates a Stripe Checkout Session for the given plan.
 * Gated by `admin.manage` (Epic D.3).
 */
export const POST = withApiErrorHandling(
    requirePermission('admin.manage', async (req: NextRequest, _routeArgs, ctx) => {
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

        return jsonResponse({ url });
    }),
);
