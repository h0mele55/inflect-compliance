/**
 * Observability Metrics — OpenTelemetry counters, histograms, and gauges.
 *
 * ── REQUEST METRICS ──
 *   api.request.count      — Counter   (method, route, status)
 *   api.request.duration   — Histogram (method, route, status) [ms]
 *   api.request.errors     — Counter   (method, route, errorCode)
 *
 * ── JOB METRICS ──
 *   job.execution.count    — Counter   (job_name, status: success|failure)
 *   job.execution.duration — Histogram (job_name, status) [ms]
 *   job.queue.depth        — Observable Gauge (queue_name, state)
 *
 * ── AUDIT-STREAM METRICS ──
 *   audit_stream.delivery.failures — Counter (http.status_code)
 *     Bumped once per batch whose final delivery attempt (after retry)
 *     was not-ok. Status 0 == network throw / timeout.
 *
 * CARDINALITY SAFETY:
 *   Route labels are normalized via `normalizeRoute()` to collapse dynamic
 *   segments (UUIDs, slugs) into placeholder tokens. This prevents
 *   unbounded label growth from entity-specific URLs.
 *
 * LAZY INITIALIZATION:
 *   All instruments are created on first access to give the global
 *   MeterProvider time to register. When OTel is not initialized,
 *   the noop meter produces zero-overhead noop instruments.
 *
 * These are recorded from:
 *   - `withApiErrorHandling` (request metrics)
 *   - `runJob` / `executorRegistry.execute` (job metrics)
 *   - `startQueueDepthReporting` (queue depth gauge)
 */

import { metrics } from '@opentelemetry/api';

const METER_NAME = 'inflect-compliance';

function getMeter() {
    return metrics.getMeter(METER_NAME);
}

// ════════════════════════════════════════════════════════════════════════
// ROUTE NORMALIZATION — Cardinality Safety
// ════════════════════════════════════════════════════════════════════════

/**
 * UUID v4 pattern — matches standard 36-char UUIDs.
 * Used to collapse entity IDs in URL paths.
 */
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * CUID / nanoid / opaque-id pattern — matches 20+ char alphanumeric segments.
 * Guards against non-UUID ID formats that would still cause cardinality explosion.
 */
const OPAQUE_ID_RE = /\/[a-z0-9]{20,}\b/gi;

/**
 * Normalize a raw request pathname to a route template safe for metric labels.
 *
 * Collapses:
 *   - UUIDs → :id
 *   - Tenant slugs in /t/[slug]/ → :tenantSlug
 *   - Long opaque IDs → :id
 *
 * Examples:
 *   /api/t/acme-corp/controls/550e8400-e29b-41d4-a716-446655440000
 *     → /api/t/:tenantSlug/controls/:id
 *
 *   /api/t/my-tenant/evidence/abc123def456
 *     → /api/t/:tenantSlug/evidence/abc123def456  (short IDs kept — low cardinality)
 *
 * @param pathname — raw URL pathname from req.nextUrl.pathname
 * @returns normalized route string, safe for OTel labels
 */
export function normalizeRoute(pathname: string): string {
    let route = pathname;

    // 1. Replace UUIDs with :id
    route = route.replace(UUID_RE, ':id');

    // 2. Replace tenant slug in /t/<slug>/ or /api/t/<slug>/
    //    Next.js dynamic segment: /t/[tenantSlug]/...
    route = route.replace(/\/t\/([^/]+)\//, '/t/:tenantSlug/');

    // 3. Replace remaining long opaque IDs
    route = route.replace(OPAQUE_ID_RE, '/:id');

    return route;
}

// ════════════════════════════════════════════════════════════════════════
// REQUEST METRICS — Instrument Singletons
// ════════════════════════════════════════════════════════════════════════

let _requestCount: ReturnType<ReturnType<typeof getMeter>['createCounter']> | null = null;
let _requestDuration: ReturnType<ReturnType<typeof getMeter>['createHistogram']> | null = null;
let _requestErrors: ReturnType<ReturnType<typeof getMeter>['createCounter']> | null = null;

function getRequestCount() {
    if (!_requestCount) {
        _requestCount = getMeter().createCounter('api.request.count', {
            description: 'Total number of API requests',
            unit: '1',
        });
    }
    return _requestCount;
}

function getRequestDuration() {
    if (!_requestDuration) {
        _requestDuration = getMeter().createHistogram('api.request.duration', {
            description: 'API request duration in milliseconds',
            unit: 'ms',
        });
    }
    return _requestDuration;
}

function getRequestErrors() {
    if (!_requestErrors) {
        _requestErrors = getMeter().createCounter('api.request.errors', {
            description: 'Total number of API request errors',
            unit: '1',
        });
    }
    return _requestErrors;
}

/**
 * Record a completed API request.
 *
 * Route is auto-normalized to prevent label cardinality explosion.
 * Called from `withApiErrorHandling` on every request completion.
 */
export function recordRequestMetrics(attrs: {
    method: string;
    route: string;
    status: number;
    durationMs: number;
}): void {
    const normalizedRoute = normalizeRoute(attrs.route);

    const labels = {
        'http.method': attrs.method,
        'http.route': normalizedRoute,
        'http.status_code': attrs.status,
    };

    getRequestCount().add(1, labels);
    getRequestDuration().record(attrs.durationMs, labels);
}

/**
 * Record an API request error.
 *
 * Route is auto-normalized.
 */
export function recordRequestError(attrs: {
    method: string;
    route: string;
    errorCode: string;
}): void {
    getRequestErrors().add(1, {
        'http.method': attrs.method,
        'http.route': normalizeRoute(attrs.route),
        'error.code': attrs.errorCode,
    });
}

// ════════════════════════════════════════════════════════════════════════
// JOB METRICS — Instrument Singletons
// ════════════════════════════════════════════════════════════════════════

let _jobCount: ReturnType<ReturnType<typeof getMeter>['createCounter']> | null = null;
let _jobDuration: ReturnType<ReturnType<typeof getMeter>['createHistogram']> | null = null;

function getJobCount() {
    if (!_jobCount) {
        _jobCount = getMeter().createCounter('job.execution.count', {
            description: 'Total number of job executions',
            unit: '1',
        });
    }
    return _jobCount;
}

function getJobDuration() {
    if (!_jobDuration) {
        _jobDuration = getMeter().createHistogram('job.execution.duration', {
            description: 'Job execution duration in milliseconds',
            unit: 'ms',
        });
    }
    return _jobDuration;
}

/**
 * Record a completed job execution.
 *
 * @param attrs.jobName — the job name (bounded set from JobPayloadMap)
 * @param attrs.success — whether the job completed without error
 * @param attrs.durationMs — execution time in milliseconds
 */
export function recordJobMetrics(attrs: {
    jobName: string;
    success: boolean;
    durationMs: number;
}): void {
    const labels = {
        'job.name': attrs.jobName,
        'job.status': attrs.success ? 'success' : 'failure',
    };

    getJobCount().add(1, labels);
    getJobDuration().record(attrs.durationMs, labels);
}

// ════════════════════════════════════════════════════════════════════════
// AUDIT-STREAM METRICS — Instrument Singletons
// ════════════════════════════════════════════════════════════════════════

let _auditStreamFailures: ReturnType<ReturnType<typeof getMeter>['createCounter']> | null = null;

function getAuditStreamFailures() {
    if (!_auditStreamFailures) {
        _auditStreamFailures = getMeter().createCounter('audit_stream.delivery.failures', {
            description: 'Audit-stream batches whose final delivery attempt was not-ok (after retry)',
            unit: '1',
        });
    }
    return _auditStreamFailures;
}

/**
 * Record a final-attempt delivery failure for an audit-stream batch.
 *
 * Called from `deliverBatch` in `src/app-layer/events/audit-stream.ts`
 * when the retry loop exhausts all attempts. NOT called per retry
 * attempt — one bump per batch.
 *
 * Labels: only `http.status_code` (finite cardinality). Status 0
 * means the final attempt threw (network error, timeout) rather
 * than returning an HTTP response. TenantId deliberately NOT a
 * label — tenant-level debugging uses the existing structured
 * `logger.warn` in the same code path.
 */
export function recordAuditStreamDeliveryFailure(attrs: { status: number }): void {
    getAuditStreamFailures().add(1, {
        'http.status_code': attrs.status,
    });
}

// ════════════════════════════════════════════════════════════════════════
// QUEUE DEPTH GAUGE — Observable (push-based)
// ════════════════════════════════════════════════════════════════════════

let _queueDepthStarted = false;

/**
 * Start periodic queue depth reporting.
 *
 * Uses OTel's ObservableGauge which is read by the metric reader
 * at export time. This avoids polling overhead — the gauge callback
 * is only invoked when the collector scrapes.
 *
 * Reports counts for: waiting, active, delayed, failed states.
 *
 * Call this once from the worker/scheduler entrypoint (not from
 * every request). Safe to call multiple times — only initializes once.
 *
 * @param getQueueFn — function that returns the BullMQ Queue instance
 */
export function startQueueDepthReporting(
    getQueueFn: () => { getJobCounts: () => Promise<Record<string, number>> },
): void {
    if (_queueDepthStarted) return;
    _queueDepthStarted = true;

    const gauge = getMeter().createObservableGauge('job.queue.depth', {
        description: 'Number of jobs in the queue by state',
        unit: '1',
    });

    gauge.addCallback(async (result) => {
        try {
            const counts = await getQueueFn().getJobCounts();

            // Only report meaningful states — avoid high-cardinality from
            // BullMQ's internal states like 'unknown' or 'paused'.
            const reportableStates = ['waiting', 'active', 'delayed', 'failed'];

            for (const state of reportableStates) {
                if (counts[state] !== undefined) {
                    result.observe(counts[state], {
                        'queue.name': 'inflect-jobs',
                        'queue.state': state,
                    });
                }
            }
        } catch {
            // Queue may not be available — noop. Gauge simply won't report.
        }
    });
}

/**
 * Reset queue depth reporting flag (for testing only).
 * @internal
 */
export function _resetQueueDepthForTesting(): void {
    _queueDepthStarted = false;
}
