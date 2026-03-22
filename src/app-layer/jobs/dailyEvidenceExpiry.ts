/**
 * Daily evidence expiry notification job.
 *
 * Sweeps at three urgency thresholds (30, 7, 1 days) to enqueue
 * emails for expiring evidence. Then flushes the outbox.
 *
 * Usage:
 *   npx tsx scripts/notifications-runner.ts
 *   # or import directly:
 *   import { runDailyEvidenceExpiryNotifications } from '@/app-layer/jobs/dailyEvidenceExpiry';
 *   await runDailyEvidenceExpiryNotifications();
 */

import { runEvidenceRetentionNotifications, type RetentionNotificationResult } from './retention-notifications';
import { processOutbox, type ProcessOutboxResult } from '../notifications/processOutbox';
import { runJob } from '@/lib/observability/job-runner';
import { logger } from '@/lib/observability/logger';

export interface DailyExpiryResult {
    sweeps: {
        days30: RetentionNotificationResult;
        days7: RetentionNotificationResult;
        days1: RetentionNotificationResult;
    };
    outbox: ProcessOutboxResult;
}

export async function runDailyEvidenceExpiryNotifications(
    options: { tenantId?: string; skipOutbox?: boolean } = {},
): Promise<DailyExpiryResult> {
    return runJob('daily-evidence-expiry', async () => {
        // Sweep at three urgency thresholds
        const days30 = await runEvidenceRetentionNotifications({ days: 30, tenantId: options.tenantId });
        logger.info('expiry sweep completed', { component: 'job', threshold: 30, tasksCreated: days30.tasksCreated, skipped: days30.skippedDuplicate });

        const days7 = await runEvidenceRetentionNotifications({ days: 7, tenantId: options.tenantId });
        logger.info('expiry sweep completed', { component: 'job', threshold: 7, tasksCreated: days7.tasksCreated, skipped: days7.skippedDuplicate });

        const days1 = await runEvidenceRetentionNotifications({ days: 1, tenantId: options.tenantId });
        logger.info('expiry sweep completed', { component: 'job', threshold: 1, tasksCreated: days1.tasksCreated, skipped: days1.skippedDuplicate });

        // Flush outbox
        let outbox: ProcessOutboxResult = { sent: 0, failed: 0, skipped: 0 };
        if (!options.skipOutbox) {
            outbox = await processOutbox({ limit: 200 });
            logger.info('outbox flushed', { component: 'job', sent: outbox.sent, failed: outbox.failed, skipped: outbox.skipped });
        }

        return { sweeps: { days30, days7, days1 }, outbox };
    }, { tenantId: options.tenantId });
}
