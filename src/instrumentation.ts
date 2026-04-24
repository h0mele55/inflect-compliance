/**
 * Next.js Instrumentation Hook — called once on server startup.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
    // Only initialize on the server (Node.js runtime), not Edge.
    if (process.env.NEXT_RUNTIME === 'nodejs' || !process.env.NEXT_RUNTIME) {
        // Bump EventEmitter cap so undici's keep-alive socket pooling
        // doesn't trigger spurious MaxListenersExceededWarning lines for
        // the per-socket unpipe/error/close/finish listeners that
        // accumulate across pooled requests. Default is 10 — every test
        // run was producing dozens of these warnings under serial-mode
        // E2E pressure with no actual leak (sockets get reused and the
        // listeners are torn down when the request stream finishes).
        const { EventEmitter } = await import('node:events');
        if (EventEmitter.defaultMaxListeners < 50) {
            EventEmitter.defaultMaxListeners = 50;
        }

        const { initTelemetry } = await import('@/lib/observability/instrumentation');
        const { initSentry } = await import('@/lib/observability/sentry');
        const { installAutomationBusDispatcher } = await import(
            '@/app-layer/automation/bus-bootstrap'
        );
        const { installRlsTripwire } = await import('@/lib/db/rls-middleware');
        const { prisma } = await import('@/lib/prisma');
        const { installShutdownHandlers } = await import('@/lib/observability/shutdown');
        await initTelemetry();
        initSentry();
        // Wire the automation bus to the BullMQ queue so domain
        // events emitted from usecases enqueue dispatch jobs.
        installAutomationBusDispatcher();
        // Install the RLS observability tripwire. Idempotent — safe
        // under HMR. Installed here (not in `prisma.ts`) to avoid a
        // circular import with `db/rls-middleware.ts`.
        installRlsTripwire(prisma);
        // Register SIGTERM/SIGINT handlers that drain audit-stream
        // buffers, OTel exporters, and Sentry transport before the
        // process exits. Idempotent under HMR.
        installShutdownHandlers();
    }
}

