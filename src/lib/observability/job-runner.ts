/**
 * Job Runner — structured observability wrapper for background jobs.
 *
 * Provides:
 * - Unique jobRunId for correlation
 * - AsyncLocalStorage request context
 * - Structured Pino logging (start / success / failure)
 * - OTel span wrapping
 * - Sentry error capture
 *
 * Usage:
 *   import { runJob } from '@/lib/observability/job-runner';
 *   const result = await runJob('retention-sweep', async () => {
 *       logger.info('scanning tenants', { count: 5 });
 *       return { scanned: 100, expired: 3 };
 *   });
 */

import { runWithRequestContext } from './context';
import { logger } from './logger';
import { traceOperation } from './tracing';
import { captureError } from './sentry';
import { recordJobMetrics } from './metrics';

/**
 * Run a background job with full observability context.
 *
 * @param jobName — identifier for the job (e.g. 'retention-sweep', 'daily-expiry')
 * @param fn — async function that returns a result
 * @param options — optional tenantId for tenant-scoped jobs
 */
export async function runJob<T>(
    jobName: string,
    fn: () => Promise<T>,
    options?: { tenantId?: string },
): Promise<T> {
    const jobRunId = crypto.randomUUID();
    const startTime = performance.now();

    return runWithRequestContext(
        {
            requestId: jobRunId,
            route: `job:${jobName}`,
            startTime,
            tenantId: options?.tenantId,
        },
        async () => {
            const meta = { component: 'job', jobName, jobRunId };

            logger.info('job started', meta);

            return traceOperation(`job.${jobName}`, { 'job.runId': jobRunId }, async () => {
                try {
                    const result = await fn();
                    const durationMs = Math.round(performance.now() - startTime);

                    // ── Record job success metric ──
                    recordJobMetrics({ jobName, success: true, durationMs });

                    logger.info('job completed', { ...meta, durationMs });

                    return result;
                } catch (error) {
                    const durationMs = Math.round(performance.now() - startTime);

                    // ── Record job failure metric ──
                    recordJobMetrics({ jobName, success: false, durationMs });

                    logger.error('job failed', {
                        ...meta,
                        durationMs,
                        error: error instanceof Error
                            ? { name: error.name, message: error.message }
                            : { name: 'UnknownError', message: String(error) },
                    });

                    captureError(error, {
                        requestId: jobRunId,
                        route: `job:${jobName}`,
                        status: 500,
                    });

                    throw error;
                }
            });
        },
    );
}

