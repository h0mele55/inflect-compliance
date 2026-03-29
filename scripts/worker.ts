/**
 * BullMQ Worker — Standalone Process Entrypoint
 *
 * Processes async jobs from the `inflect-jobs` queue.
 * Runs independently of the Next.js web server.
 *
 * Usage:
 *   npx tsx scripts/worker.ts
 *   # or in production:
 *   node --import tsx scripts/worker.ts
 *
 * Architecture:
 *   - Creates its own Redis connection (not the app singleton)
 *   - Registers processors for each typed job name
 *   - Delegates to existing business logic functions (preserving observability)
 *   - Graceful shutdown on SIGTERM/SIGINT
 *   - Structured logging via Pino
 *
 * @module scripts/worker
 */
import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import pino from 'pino';
import {
    QUEUE_NAME,
    type JobName,
    type HealthCheckPayload,
    type AutomationRunnerPayload,
    type DailyEvidenceExpiryPayload,
    type DataLifecyclePayload,
    type PolicyReviewReminderPayload,
    type RetentionSweepPayload,
} from '../src/app-layer/jobs/types';

// ─── Standalone logger ───

const log = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname', translateTime: 'HH:MM:ss.l' } }
        : undefined,
});

// ─── Redis connection ───

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
    log.fatal('REDIS_URL is not set. Cannot start worker.');
    process.exit(1);
}

function createWorkerConnection(): Redis {
    return new Redis(REDIS_URL!, {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
        connectTimeout: 10000,
        connectionName: 'inflect-worker',
    });
}

// ═══════════════════════════════════════════════════════════════════
// Job Processors
//
// Each processor delegates to the existing business logic function.
// The business logic modules use `runJob()` internally for
// observability (correlation IDs, OTel spans, Sentry).
// ═══════════════════════════════════════════════════════════════════

async function processHealthCheck(job: Job<HealthCheckPayload>) {
    log.info({ jobId: job.id, payload: job.data }, 'processing health-check');
    return {
        status: 'ok',
        processedAt: new Date().toISOString(),
        enqueuedAt: job.data.enqueuedAt,
        message: job.data.message || 'pong',
    };
}

async function processAutomationRunner(job: Job<AutomationRunnerPayload>) {
    log.info({ jobId: job.id, payload: job.data }, 'processing automation-runner');
    // Dynamic import to avoid loading Prisma/app modules at worker boot
    const { runScheduledAutomations } = await import('../src/app-layer/jobs/automation-runner');
    const result = await runScheduledAutomations({
        tenantId: job.data.tenantId,
        dryRun: job.data.dryRun,
    });
    log.info({ jobId: job.id, result }, 'automation-runner completed');
    return result;
}

async function processDailyEvidenceExpiry(job: Job<DailyEvidenceExpiryPayload>) {
    log.info({ jobId: job.id, payload: job.data }, 'processing daily-evidence-expiry');
    const { runDailyEvidenceExpiryNotifications } = await import('../src/app-layer/jobs/dailyEvidenceExpiry');
    const result = await runDailyEvidenceExpiryNotifications({
        tenantId: job.data.tenantId,
        skipOutbox: job.data.skipOutbox,
    });
    log.info({ jobId: job.id, result }, 'daily-evidence-expiry completed');
    return result;
}

async function processDataLifecycle(job: Job<DataLifecyclePayload>) {
    log.info({ jobId: job.id, payload: job.data }, 'processing data-lifecycle');
    const {
        purgeSoftDeletedOlderThan,
        purgeExpiredEvidenceOlderThan,
        runRetentionSweep,
    } = await import('../src/app-layer/jobs/data-lifecycle');

    // Run all three sub-jobs sequentially
    const purgeResults = await purgeSoftDeletedOlderThan({
        tenantId: job.data.tenantId,
        dryRun: job.data.dryRun,
    });
    const evidencePurge = await purgeExpiredEvidenceOlderThan({
        tenantId: job.data.tenantId,
        dryRun: job.data.dryRun,
    });
    const retentionResults = await runRetentionSweep({
        tenantId: job.data.tenantId,
        dryRun: job.data.dryRun,
    });

    const result = { purgeResults, evidencePurge, retentionResults };
    log.info({ jobId: job.id, result }, 'data-lifecycle completed');
    return result;
}

async function processPolicyReviewReminder(job: Job<PolicyReviewReminderPayload>) {
    log.info({ jobId: job.id, payload: job.data }, 'processing policy-review-reminder');
    const { processOverdueReminders } = await import('../src/app-layer/jobs/policyReviewReminder');
    const { prisma } = await import('../src/lib/prisma');
    const result = await processOverdueReminders(prisma);
    log.info({ jobId: job.id, processed: result.processed }, 'policy-review-reminder completed');
    return result;
}

async function processRetentionSweep(job: Job<RetentionSweepPayload>) {
    log.info({ jobId: job.id, payload: job.data }, 'processing retention-sweep');
    const { runEvidenceRetentionSweep } = await import('../src/app-layer/jobs/retention');
    const result = await runEvidenceRetentionSweep({
        tenantId: job.data.tenantId,
        dryRun: job.data.dryRun,
    });
    log.info({ jobId: job.id, result }, 'retention-sweep completed');
    return result;
}

// ─── Processor Registry ───

/* eslint-disable @typescript-eslint/no-explicit-any */
const processors: Record<string, (job: Job<any>) => Promise<any>> = {
    'health-check': processHealthCheck,
    'automation-runner': processAutomationRunner,
    'daily-evidence-expiry': processDailyEvidenceExpiry,
    'data-lifecycle': processDataLifecycle,
    'policy-review-reminder': processPolicyReviewReminder,
    'retention-sweep': processRetentionSweep,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Worker Bootstrap ───

log.info({ queueName: QUEUE_NAME, redisUrl: REDIS_URL.replace(/\/\/.*@/, '//***@') }, 'starting worker');

const connection = createWorkerConnection();

const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
        const jobName = job.name as JobName;
        const processor = processors[jobName];

        if (!processor) {
            log.warn({ jobName, jobId: job.id }, 'no processor registered for job — skipping');
            return { skipped: true, reason: `no processor for "${jobName}"` };
        }

        const startTime = performance.now();

        try {
            const result = await processor(job);
            const durationMs = Math.round(performance.now() - startTime);

            log.info({
                jobName,
                jobId: job.id,
                attemptsMade: job.attemptsMade,
                durationMs,
            }, 'job processed successfully');

            return result;
        } catch (error) {
            const durationMs = Math.round(performance.now() - startTime);

            log.error({
                jobName,
                jobId: job.id,
                attemptsMade: job.attemptsMade,
                durationMs,
                err: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
            }, 'job processing failed');

            throw error; // Re-throw for BullMQ retry
        }
    },
    {
        connection,
        concurrency: 5,
        limiter: {
            max: 50,
            duration: 60000,
        },
    },
);

// ─── Worker Events ───

worker.on('ready', () => {
    log.info({
        queueName: QUEUE_NAME,
        processors: Object.keys(processors),
    }, 'worker ready — listening for jobs');
});

worker.on('failed', (job, error) => {
    log.error({
        jobName: job?.name,
        jobId: job?.id,
        attemptsMade: job?.attemptsMade,
        err: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    }, 'job failed (BullMQ event)');
});

worker.on('stalled', (jobId) => {
    log.warn({ jobId }, 'job stalled — will be retried');
});

worker.on('error', (error) => {
    log.error({
        err: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    }, 'worker error');
});

// ─── Graceful Shutdown ───

async function shutdown(signal: string) {
    log.info({ signal }, 'shutdown signal received — closing worker');

    try {
        await worker.close();
        await connection.quit();
        log.info('worker shut down gracefully');
        process.exit(0);
    } catch (error) {
        log.error({ err: error }, 'error during shutdown');
        process.exit(1);
    }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

log.info('worker process started — press Ctrl+C to stop');
