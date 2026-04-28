/**
 * POST /api/integrations/webhooks/[provider]
 *
 * Generic webhook receiver for the integration framework.
 * Routes incoming webhooks to the correct provider handler.
 *
 * Security:
 *   - Reads raw body for signature verification (not parsed JSON)
 *   - Resolves tenant from IntegrationConnection (never from caller)
 *   - Validates signature before processing
 *   - Returns 200 for valid events (even if processing fails) to prevent retries
 *   - Never exposes internal errors in responses
 *
 * Flow:
 *   1. Extract provider from URL params
 *   2. Read raw body and headers
 *   3. Persist raw event as IntegrationWebhookEvent (status: received)
 *   4. Resolve IntegrationConnection → tenant
 *   5. Verify signature using connection's webhook secret
 *   6. Dispatch to provider-specific handler
 *   7. Update event status (processed/ignored/error)
 */
import { NextRequest, NextResponse } from 'next/server';
import { processIncomingWebhook } from '@/app-layer/usecases/webhook-processor';
import { logger } from '@/lib/observability/logger';
import { jsonResponse } from '@/lib/api-response';

interface RouteParams {
    params: Promise<{ provider: string }>;
}

export async function POST(req: NextRequest, props: RouteParams): Promise<NextResponse> {
    const params = await props.params;
    const { provider } = params;

    if (!provider || typeof provider !== 'string') {
        return jsonResponse({ error: 'Missing provider' }, { status: 400 });
    }

    try {
        // Read raw body BEFORE parsing — needed for signature verification
        const rawBody = await req.text();

        // Collect relevant headers (lowercase keys)
        const headers: Record<string, string> = {};
        req.headers.forEach((value, key) => {
            headers[key.toLowerCase()] = value;
        });

        // Dispatch to processing usecase
        const result = await processIncomingWebhook({
            provider,
            rawBody,
            headers,
        });

        // Always return 200 for valid requests (prevent webhook retries on processing errors)
        // Only return 4xx for auth/validation failures
        if (result.status === 'auth_failed') {
            return jsonResponse(
                { error: 'Webhook authentication failed' },
                { status: 401 }
            );
        }

        if (result.status === 'invalid_provider') {
            return jsonResponse(
                { error: 'Unknown integration provider' },
                { status: 404 }
            );
        }

        return jsonResponse({
            received: true,
            eventId: result.eventId,
            status: result.status,
        });
    } catch (err) {
        // Never expose internal errors
        logger.error('Webhook route: unexpected error', {
            component: 'integrations',
            provider,
            err: err instanceof Error ? err : new Error(String(err)),
        });
        return jsonResponse(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
