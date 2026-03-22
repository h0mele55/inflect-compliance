import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/env';
import { toApiErrorResponse, ApiErrorResponse } from './types';
import { runWithRequestContext } from '@/lib/observability/context';
import { logger, extractErrorMeta } from '@/lib/observability/logger';

// Depending on the Node.js / Edge runtime version, crypto.randomUUID() is natively available globally.
// If it fails (e.g. extremely old runtimes), fallback to a simple Math.random() based ID.
function generateRequestId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}



/**
 * High-Order Wrapper for all app/api routes.
 * 
 * Catch all throws (ZodError, AppError, primitive errors) and shapes them
 * into standardized ApiErrorResponse JSON payloads.
 * 
 * Also provides an x-request-id for correlation tracking and wraps
 * execution in an observability request context (AsyncLocalStorage).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withApiErrorHandling<Context = any>(
    handler: (req: NextRequest, ctx: Context) => Promise<NextResponse | Response> | NextResponse | Response
) {
    return async (req: NextRequest, ctx: Context): Promise<NextResponse | Response> => {
        const requestId = req.headers.get('x-request-id') || generateRequestId();
        const route = req.nextUrl.pathname;

        // Run the entire request inside an observability context so that
        // any downstream code can access requestId/route via getRequestContext().
        // tenantId and userId are enriched later by getTenantCtx/getLegacyCtx.
        return runWithRequestContext(
            { requestId, route, startTime: performance.now() },
            async () => {
                try {
                    // Execute the original handler
                    const response = await handler(req, ctx);

                    // Apply request ID to response headers if it's a NextResponse
                    if (response instanceof NextResponse) {
                        response.headers.set('x-request-id', requestId);
                    } else if (response instanceof Response) {
                        // clone and append headers if plain standard Response
                        const newHeaders = new Headers(response.headers);
                        newHeaders.set('x-request-id', requestId);
                        return new Response(response.body, {
                            status: response.status,
                            statusText: response.statusText,
                            headers: newHeaders
                        });
                    }

                    return response;

                } catch (error) {
                    // Unhandled throw! Map it.
                    const { payload, status } = toApiErrorResponse(error, requestId);

                    // Structured error logging — always emitted (context auto-enriched)
                    logger.error(`API error ${status} ${req.method} ${route}`, {
                        component: 'api',
                        status,
                        method: req.method,
                        errorCode: payload.error.code,
                        error: extractErrorMeta(error),
                    });

                    // In local dev ONLY, also log the full stack for debugging.
                    if (env.NODE_ENV === 'development') {
                        try {
                            console.error(`\n[API Error ${status}] [ID: ${requestId}] ${req.method} ${req.url}`);
                            if (error instanceof Error) {
                                console.error('[Stack]:', error.stack);
                            }
                        } catch { /* Node inspect crash on Prisma errors */ }
                    }

                    return NextResponse.json(payload, {
                        status,
                        headers: {
                            'x-request-id': requestId,
                            'Cache-Control': 'no-store, max-age=0'
                        }
                    });
                }
            },
        );
    };
}
