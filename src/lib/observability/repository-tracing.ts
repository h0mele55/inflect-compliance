/**
 * Repository instrumentation helper (Epic OI-3).
 *
 * Wraps a repository method body with:
 *   - an OTel span named `repo.<method>` with the standard request-context
 *     attributes (tenantId, userId, role, requestId)
 *   - the spec-required `repo.method`, `repo.tenant_id`, `repo.duration`,
 *     `repo.result_count` attributes
 *   - low-cardinality metrics (`repo.method.duration`, `repo.method.calls`,
 *     `repo.method.errors`, `repo.method.result_count`) labelled by
 *     METHOD NAME + OUTCOME ONLY — never by tenant_id (which would
 *     explode metric cardinality on a multi-tenant deployment).
 *
 * Usage:
 *   static async list(db: PrismaTx, ctx: RequestContext, filters?: F) {
 *     return traceRepository('risk.list', ctx, async () => {
 *       return db.risk.findMany({ where: ... });
 *     });
 *   }
 *
 * Result-count auto-detection:
 *   - Array result          → result.length
 *   - { items: [...] }      → result.items.length (paginated DTOs)
 *   - { count: N }          → result.count       (Prisma count() results)
 *   - Single object | void  → null (skipped)
 *
 * Cardinality safety:
 *   - The metric label set is fixed: { 'repo.method': string, 'outcome': 'success'|'error' }.
 *   - METHOD names live in code (bounded). OUTCOME has 2 values.
 *   - tenant_id, user_id, etc. are SPAN attributes (queryable in trace
 *     backends via tag search) — NOT metric labels (where they'd
 *     explode).
 *
 * Span lifetime:
 *   - End-of-method finally block always runs (no leaked spans).
 *   - On error: span marked status=ERROR, exception recorded, then
 *     re-thrown — caller's existing error handling stays unchanged.
 */

import { SpanStatusCode, type Span } from '@opentelemetry/api';
import type { RequestContext } from '@/app-layer/types';
import { getTracer } from './tracing';
import {
    getRepositoryDurationHistogram,
    getRepositoryCallCounter,
    getRepositoryErrorCounter,
    getRepositoryResultCountHistogram,
} from './metrics';

/**
 * Detect a result count from a repository return value.
 * Returns null when the shape doesn't carry a meaningful count.
 */
export function detectResultCount(value: unknown): number | null {
    if (Array.isArray(value)) return value.length;
    if (value !== null && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        if (Array.isArray(obj.items)) return obj.items.length;
        if (typeof obj.count === 'number') return obj.count;
    }
    return null;
}

/**
 * Wrap a repository method body in an OTel span + metrics emission.
 *
 * The `method` argument MUST be a stable, code-bounded identifier
 * (e.g. 'risk.list'). The metric instrument labels this verbatim,
 * so a runtime-derived value would create unbounded cardinality.
 */
export async function traceRepository<T>(
    method: string,
    ctx: RequestContext,
    fn: () => Promise<T>,
): Promise<T> {
    const tracer = getTracer();
    const start = Date.now();

    return tracer.startActiveSpan(`repo.${method}`, async (span: Span) => {
        // Span attributes — high-cardinality safe because they're per-trace,
        // not metric labels. Operators query traces by tenant.id when
        // debugging a tenant-specific issue.
        span.setAttributes({
            'repo.method': method,
            'repo.tenant_id': ctx.tenantId ?? 'unknown',
            'app.tenantId': ctx.tenantId ?? 'unknown',
            'app.userId': ctx.userId ?? 'unknown',
            'app.role': ctx.role ?? 'unknown',
            'app.requestId': ctx.requestId ?? 'unknown',
        });

        try {
            const result = await fn();
            const duration = Date.now() - start;
            const resultCount = detectResultCount(result);

            // Span attributes
            span.setAttribute('repo.duration_ms', duration);
            if (resultCount !== null) {
                span.setAttribute('repo.result_count', resultCount);
            }

            // Metrics — low-cardinality labels only
            const labels = { 'repo.method': method, outcome: 'success' };
            getRepositoryDurationHistogram().record(duration, labels);
            getRepositoryCallCounter().add(1, labels);
            if (resultCount !== null) {
                getRepositoryResultCountHistogram().record(resultCount, {
                    'repo.method': method,
                });
            }

            span.setStatus({ code: SpanStatusCode.OK });
            return result;
        } catch (err) {
            const duration = Date.now() - start;
            span.setAttribute('repo.duration_ms', duration);

            const labels = { 'repo.method': method, outcome: 'error' };
            getRepositoryDurationHistogram().record(duration, labels);
            getRepositoryCallCounter().add(1, labels);
            getRepositoryErrorCounter().add(1, {
                'repo.method': method,
                'error.type': err instanceof Error ? err.name : 'unknown',
            });

            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: err instanceof Error ? err.message : String(err),
            });
            if (err instanceof Error) {
                span.recordException(err);
            }
            throw err;
        } finally {
            span.end();
        }
    });
}
