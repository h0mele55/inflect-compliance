/**
 * Per-stage shutdown budgets. Each stage is Promise.race'd against
 * its budget so a slow exporter never blocks the process past the
 * container's grace period (k8s terminationGracePeriodSeconds
 * defaults to 30s).
 *
 * Budget invariant: SHUTDOWN_TOTAL_CEILING_MS should leave room for
 * Next.js's own HTTP-drain handler, which runs in parallel.
 */

export const SHUTDOWN_AUDIT_FLUSH_MS = 3_000;
export const SHUTDOWN_OTEL_MS        = 2_000;
export const SHUTDOWN_SENTRY_MS      = 2_000;

/** Ceiling our observability stages must fit under. Rest of the
 * k8s grace period (default 30s) belongs to Next's HTTP drain. */
export const SHUTDOWN_TOTAL_CEILING_MS = 20_000;
