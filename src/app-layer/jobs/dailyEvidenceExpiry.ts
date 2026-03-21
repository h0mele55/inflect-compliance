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
    console.log('[daily-expiry] Starting evidence expiry notification sweep...');

    // Sweep at three urgency thresholds
    const days30 = await runEvidenceRetentionNotifications({ days: 30, tenantId: options.tenantId });
    console.log(`[daily-expiry] 30-day sweep: ${days30.tasksCreated} tasks, ${days30.skippedDuplicate} skipped`);

    const days7 = await runEvidenceRetentionNotifications({ days: 7, tenantId: options.tenantId });
    console.log(`[daily-expiry] 7-day sweep: ${days7.tasksCreated} tasks, ${days7.skippedDuplicate} skipped`);

    const days1 = await runEvidenceRetentionNotifications({ days: 1, tenantId: options.tenantId });
    console.log(`[daily-expiry] 1-day sweep: ${days1.tasksCreated} tasks, ${days1.skippedDuplicate} skipped`);

    // Flush outbox
    let outbox: ProcessOutboxResult = { sent: 0, failed: 0, skipped: 0 };
    if (!options.skipOutbox) {
        outbox = await processOutbox({ limit: 200 });
        console.log(`[daily-expiry] Outbox: ${outbox.sent} sent, ${outbox.failed} failed, ${outbox.skipped} retried`);
    }

    console.log('[daily-expiry] Done.');
    return { sweeps: { days30, days7, days1 }, outbox };
}
