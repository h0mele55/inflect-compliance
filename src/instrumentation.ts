/**
 * Next.js Instrumentation Hook — called once on server startup.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
    // Only initialize on the server (Node.js runtime), not Edge.
    if (process.env.NEXT_RUNTIME === 'nodejs' || !process.env.NEXT_RUNTIME) {
        // ── R-6: Redis is required in production ──
        // Rate limits, BullMQ jobs, and caching all degrade silently
        // when REDIS_URL is unset. In dev/test that's intentional
        // (graceful fallback). In production it's a security control
        // failure: the rate-limit middleware that gates login + invite
        // redemption + email dispatch becomes a no-op.
        // Fail loudly at startup rather than silently in the audit log.
        if (
            process.env.NODE_ENV === 'production' &&
            !process.env.REDIS_URL &&
            process.env.RATE_LIMIT_ENABLED !== '0'
        ) {
            // eslint-disable-next-line no-console
            console.error(
                '[startup] FATAL: REDIS_URL is required in production ' +
                '(rate limits, jobs, and caching depend on it). ' +
                'Set REDIS_URL or explicitly disable rate limits with ' +
                'RATE_LIMIT_ENABLED=0 (NOT recommended in prod).',
            );
            process.exit(1);
        }

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

