import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/security/permission-middleware';
import { withApiErrorHandling } from '@/lib/errors/api';
import { findOrCreateCustomer, createPortalSession } from '@/lib/stripe';
import { env } from '@/env';
import { jsonResponse } from '@/lib/api-response';

/**
 * POST /api/t/[tenantSlug]/billing/portal
 * Creates a Stripe Customer Portal session.
 * Gated by `admin.manage` (Epic D.3).
 */
export const POST = withApiErrorHandling(
    requirePermission('admin.manage', async (req: NextRequest, _routeArgs, ctx) => {
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

        return jsonResponse({ url });
    }),
);
