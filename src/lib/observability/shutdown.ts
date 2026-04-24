import { flushAllAuditStreams } from '@/app-layer/events/audit-stream';
import { shutdownTelemetry } from './instrumentation';
import { shutdownSentry } from './sentry';
import { logger } from './logger';
import {
    SHUTDOWN_AUDIT_FLUSH_MS,
    SHUTDOWN_OTEL_MS,
    SHUTDOWN_SENTRY_MS,
} from './shutdown-budget';

/**
 * One-shot SIGTERM / SIGINT handler. Drains observability surfaces
 * in the order most-to-least important for audit correctness:
 *
 *   1. audit-stream buffers (irreversible data loss if dropped)
 *   2. OTel span/metric exporters (observability-only)
 *   3. Sentry transport (observability-only)
 *
 * Each stage is bounded by its budget. NEVER calls process.exit —
 * next start owns the HTTP lifecycle; we let Node exit naturally
 * once all handlers finish and the event loop drains.
 *
 * Idempotent installation: guards against double registration under
 * HMR / test re-imports via a module flag.
 */

let _installed = false;

export function installShutdownHandlers(): void {
    if (_installed) return;
    _installed = true;

    const handler = async (signal: 'SIGTERM' | 'SIGINT') => {
        logger.info('graceful shutdown initiated', {
            component: 'shutdown',
            signal,
        });

        // Stage 1 — audit (most important)
        await Promise.race([
            flushAllAuditStreams().catch((err) => {
                logger.warn('shutdown: audit flush failed', {
                    component: 'shutdown',
                    error: err instanceof Error ? err.message : String(err),
                });
            }),
            new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_AUDIT_FLUSH_MS)),
        ]);

        // Stage 2 — OTel (never throws by contract)
        await shutdownTelemetry(SHUTDOWN_OTEL_MS);

        // Stage 3 — Sentry (never throws by contract)
        await shutdownSentry(SHUTDOWN_SENTRY_MS);

        logger.info('graceful shutdown complete', {
            component: 'shutdown',
            signal,
        });
    };

    // Register one listener per signal. Use once() semantics so a second
    // SIGTERM (common in container runtimes as an escalation) fires the
    // Node default — ensures we don't block termination if the first
    // handler hangs despite the budgets.
    process.once('SIGTERM', () => { void handler('SIGTERM'); });
    process.once('SIGINT', () => { void handler('SIGINT'); });
}

/**
 * Test-only: resets the install flag. Does NOT remove listeners already
 * attached — use process.removeAllListeners('SIGTERM') in your afterEach
 * if the test registered real handlers.
 * @internal
 */
export function _resetShutdownInstalledForTesting(): void {
    _installed = false;
}
