/**
 * Outbox processor: picks up PENDING emails and sends them via the configured
 * email provider. Marks rows SENT or FAILED with retry tracking.
 *
 * Usage (cron or manual):
 *   import { processOutbox } from '@/app-layer/notifications/processOutbox';
 *   const result = await processOutbox({ limit: 50 });
 *     // { sent: 12, failed: 1, skipped: 0 }
 */

import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/mailer';
import { getTenantNotificationSettings } from './settings';

export interface ProcessOutboxOptions {
    /** Max emails to process in one run. Default: 50 */
    limit?: number;
    /** Max attempts before marking permanently FAILED. Default: 3 */
    maxAttempts?: number;
}

export interface ProcessOutboxResult {
    sent: number;
    failed: number;
    skipped: number;
}

export async function processOutbox(
    options: ProcessOutboxOptions = {},
): Promise<ProcessOutboxResult> {
    const limit = options.limit ?? 50;
    const maxAttempts = options.maxAttempts ?? 3;
    const now = new Date();

    // Fetch PENDING rows where sendAfter <= now and attempts < maxAttempts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pending = await (prisma as any).notificationOutbox.findMany({
        where: {
            status: 'PENDING',
            sendAfter: { lte: now },
            attempts: { lt: maxAttempts },
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
    });

    // Cache tenant settings to avoid N+1 queries
    const settingsCache = new Map<string, Awaited<ReturnType<typeof getTenantNotificationSettings>>>();

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of pending) {
        try {
            // Look up tenant settings (cached)
            if (!settingsCache.has(row.tenantId)) {
                settingsCache.set(row.tenantId, await getTenantNotificationSettings(prisma, row.tenantId));
            }
            const settings = settingsCache.get(row.tenantId)!;

            // Skip if tenant disabled notifications after enqueue
            if (!settings.enabled) {
                skipped++;
                continue;
            }

            await sendEmail({
                to: row.toEmail,
                subject: row.subject,
                text: row.bodyText,
                html: row.bodyHtml || undefined,
                from: `${settings.defaultFromName} <${settings.defaultFromEmail}>`,
                bcc: settings.complianceMailbox || undefined,
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (prisma as any).notificationOutbox.update({
                where: { id: row.id },
                data: {
                    status: 'SENT',
                    sentAt: new Date(),
                    attempts: row.attempts + 1,
                },
            });

            sent++;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const newAttempts = row.attempts + 1;
            const newStatus = newAttempts >= maxAttempts ? 'FAILED' : 'PENDING';

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (prisma as any).notificationOutbox.update({
                where: { id: row.id },
                data: {
                    status: newStatus,
                    attempts: newAttempts,
                    lastError: errorMessage,
                },
            });

            if (newStatus === 'FAILED') {
                failed++;
                console.error(`[notifications] Email permanently failed after ${maxAttempts} attempts: ${row.dedupeKey}`, errorMessage);
            } else {
                skipped++;
                console.warn(`[notifications] Email attempt ${newAttempts} failed, will retry: ${row.dedupeKey}`, errorMessage);
            }
        }
    }

    return { sent, failed, skipped };
}
