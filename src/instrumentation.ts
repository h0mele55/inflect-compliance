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

        // ── GAP-03: DATA_ENCRYPTION_KEY is required in production ──
        // Defense-in-depth alongside the env-schema check (`src/env.ts`):
        // schema validation catches missing/wrong-fallback configs at
        // module load, this hook catches the case where
        // SKIP_ENV_VALIDATION=1 leaks into the runtime container, and
        // the sentinel pre-flight catches structurally-valid keys that
        // happen to fail HKDF/AES (e.g. binary garbage written to env).
        //
        // The check + sentinel logic lives in
        // `@/lib/security/startup-encryption-check` so it's unit-testable
        // without spawning a child process that calls process.exit(1).
        if (process.env.NODE_ENV === 'production') {
            const { checkProductionEncryptionKey, runEncryptionSentinel } =
                await import('@/lib/security/startup-encryption-check');

            const config = checkProductionEncryptionKey(process.env);
            if (!config.ok) {
                // eslint-disable-next-line no-console
                console.error('[startup] FATAL: ' + config.reason);
                process.exit(1);
            }

            const sentinel = await runEncryptionSentinel();
            if (!sentinel.ok) {
                // eslint-disable-next-line no-console
                console.error('[startup] FATAL: ' + sentinel.reason);
                process.exit(1);
            }
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

