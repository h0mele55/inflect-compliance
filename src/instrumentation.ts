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
        const { installAutomationBusDispatcher } = await import(
            '@/app-layer/automation/bus-bootstrap'
        );
        const { installRlsTripwire } = await import('@/lib/db/rls-middleware');
        const { prisma } = await import('@/lib/prisma');
        await initTelemetry();
        initSentry();
        // Wire the automation bus to the BullMQ queue so domain
        // events emitted from usecases enqueue dispatch jobs.
        installAutomationBusDispatcher();
        // Install the RLS observability tripwire. Idempotent — safe
        // under HMR. Installed here (not in `prisma.ts`) to avoid a
        // circular import with `db/rls-middleware.ts`.
        installRlsTripwire(prisma);
    }
}

