#!/usr/bin/env tsx
/**
 * Notification runner — CLI entry point for cron jobs.
 *
 * Usage:
 *   npx tsx scripts/notifications-runner.ts              # full sweep + outbox
 *   npx tsx scripts/notifications-runner.ts --outbox     # outbox flush only
 *   npx tsx scripts/notifications-runner.ts --dry-run    # log only, no sending
 *   npx tsx scripts/notifications-runner.ts --tenant=XXX # single tenant
 *
 * Cron examples:
 *   # Daily at 8am: full sweep + send
 *   0 8 * * * cd /app && npx tsx scripts/notifications-runner.ts
 *
 *   # Every 5 min: outbox flush only
 *   *\/5 * * * * cd /app && npx tsx scripts/notifications-runner.ts --outbox
 *
 * Vercel Cron:
 *   Create /api/cron/notifications/route.ts calling runNotificationRunner()
 *   Add to vercel.json: { "crons": [{ "path": "/api/cron/notifications", "schedule": "0 8 * * *" }] }
 */

import { runDailyEvidenceExpiryNotifications } from '../src/app-layer/jobs/dailyEvidenceExpiry';
import { processOutbox } from '../src/app-layer/notifications/processOutbox';
import { initMailerFromEnv } from '../src/lib/mailer';

async function main() {
    const args = process.argv.slice(2);
    const outboxOnly = args.includes('--outbox');
    const dryRun = args.includes('--dry-run');
    const tenantArg = args.find(a => a.startsWith('--tenant='));
    const tenantId = tenantArg?.split('=')[1];

    console.log('═══════════════════════════════════════');
    console.log('📧 Notification Runner');
    console.log(`  Mode: ${outboxOnly ? 'outbox-only' : 'full sweep + outbox'}`);
    console.log(`  Dry run: ${dryRun}`);
    if (tenantId) console.log(`  Tenant: ${tenantId}`);
    console.log('═══════════════════════════════════════');

    // Initialize mailer from env (skips in dry-run — keeps console sink)
    if (!dryRun) {
        initMailerFromEnv();
    }

    if (outboxOnly) {
        const result = await processOutbox({ limit: 200 });
        console.log(`\n✅ Outbox: ${result.sent} sent, ${result.failed} failed, ${result.skipped} retried`);
    } else {
        const result = await runDailyEvidenceExpiryNotifications({
            tenantId,
            skipOutbox: dryRun,
        });
        console.log('\n✅ Summary:');
        console.log(`  30d sweep: ${result.sweeps.days30.tasksCreated} tasks`);
        console.log(`  7d sweep:  ${result.sweeps.days7.tasksCreated} tasks`);
        console.log(`  1d sweep:  ${result.sweeps.days1.tasksCreated} tasks`);
        if (!dryRun) {
            console.log(`  Outbox: ${result.outbox.sent} sent, ${result.outbox.failed} failed`);
        }
    }
}

main().catch(err => {
    console.error('❌ Notification runner failed:', err);
    process.exit(1);
});
