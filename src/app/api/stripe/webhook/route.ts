import { NextRequest, NextResponse } from 'next/server';
import { constructWebhookEvent, handleWebhookEvent } from '@/lib/stripe';
import { logger } from '@/lib/observability/logger';

/**
 * POST /api/stripe/webhook
 * Stripe webhook endpoint. Public (no auth), but verifies signature.
 *
 * IMPORTANT: This route must NOT parse body as JSON — Stripe signature
 * verification requires the raw body text.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
        return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }

    let event;
    try {
        const body = await req.text();
        event = constructWebhookEvent(body, signature);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid signature';
        logger.error('Stripe webhook signature verification failed', { component: 'stripe', error: message });
        return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
    }

    try {
        await handleWebhookEvent(event);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Stripe webhook event processing failed', { component: 'stripe', error: message });
        // Return 200 anyway to prevent Stripe from retrying — we log the error
        // In production, this should alert to an error tracking service
    }

    return NextResponse.json({ received: true });
}
