import {
    SHUTDOWN_AUDIT_FLUSH_MS,
    SHUTDOWN_OTEL_MS,
    SHUTDOWN_SENTRY_MS,
    SHUTDOWN_TOTAL_CEILING_MS,
} from '@/lib/observability/shutdown-budget';

describe('shutdown budget sanity', () => {
    it('sum of stage budgets fits under the total ceiling', () => {
        const stages = SHUTDOWN_AUDIT_FLUSH_MS + SHUTDOWN_OTEL_MS + SHUTDOWN_SENTRY_MS;
        expect(stages).toBeLessThan(SHUTDOWN_TOTAL_CEILING_MS);
    });

    it('ceiling leaves at least 10s for Next HTTP drain under k8s 30s grace', () => {
        expect(SHUTDOWN_TOTAL_CEILING_MS).toBeLessThanOrEqual(20_000);
    });
});
