/**
 * Next.js Instrumentation Hook — called once on server startup.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
    // Only initialize on the server (Node.js runtime), not Edge.
    if (process.env.NEXT_RUNTIME === 'nodejs' || !process.env.NEXT_RUNTIME) {
        const { initTelemetry } = await import('@/lib/observability/instrumentation');
        const { initSentry } = await import('@/lib/observability/sentry');
        await initTelemetry();
        initSentry();
    }
}

