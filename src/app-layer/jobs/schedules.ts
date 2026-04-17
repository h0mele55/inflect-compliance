/**
 * Job Schedules — BullMQ Repeatable Job Definitions
 *
 * Defines the cron patterns and repeatable options for every scheduled job.
 * These are registered once by `scripts/scheduler.ts` and then BullMQ
 * automatically enqueues jobs at the specified cadence.
 *
 * Schedule semantics (preserved from legacy cron docs/comments):
 *   - automation-runner:       every 15 min (control check scheduling)
 *   - daily-evidence-expiry:   daily at 06:00 UTC (sweep + outbox)
 *   - data-lifecycle:          daily at 03:00 UTC (purge + retention)
 *   - policy-review-reminder:  daily at 08:00 UTC (overdue review audit)
 *   - retention-sweep:         daily at 04:00 UTC (evidence archival)
 *   - notification-dispatch:   daily at 07:00 UTC (single-pass: monitors + digest dispatch)
 *
 * IMPORTANT: deadline-monitor, evidence-expiry-monitor, and vendor-renewal-check
 * are NOT scheduled independently. They run as part of notification-dispatch
 * to prevent duplicate database scans. They remain registered in the executor
 * registry for ad-hoc/CLI/API use.
 *
 * All times are UTC. BullMQ uses standard cron syntax.
 *
 * @module app-layer/jobs/schedules
 */
import type { JobName } from './types';

export interface ScheduleDefinition {
    /** Job name — must match a key in JobPayloadMap */
    name: JobName;
    /** Cron pattern (UTC) */
    pattern: string;
    /** Human-readable description */
    description: string;
    /** Default payload for the repeatable job */
    defaultPayload: Record<string, unknown>;
    /** BullMQ repeat options */
    options?: {
        /** Timezone (default: UTC) */
        tz?: string;
        /** Max runs (undefined = forever) */
        limit?: number;
    };
}

/**
 * All scheduled jobs in the system.
 * Used by `scripts/scheduler.ts` to register repeatable jobs.
 */
export const SCHEDULED_JOBS: ScheduleDefinition[] = [
    {
        name: 'automation-runner',
        pattern: '*/15 * * * *',  // every 15 minutes
        description: 'Execute scheduled automation/integration checks for controls',
        defaultPayload: {},
    },
    {
        name: 'daily-evidence-expiry',
        pattern: '0 6 * * *',     // daily at 06:00 UTC
        description: 'Sweep expiring evidence at 30/7/1 day thresholds + flush outbox',
        defaultPayload: {},
    },
    {
        name: 'data-lifecycle',
        pattern: '0 3 * * *',     // daily at 03:00 UTC
        description: 'Purge soft-deleted records, expired evidence, and run retention sweep',
        defaultPayload: { dryRun: false },
    },
    {
        name: 'policy-review-reminder',
        pattern: '0 8 * * *',     // daily at 08:00 UTC
        description: 'Find overdue policies and emit audit events / notifications',
        defaultPayload: {},
    },
    {
        name: 'retention-sweep',
        pattern: '0 4 * * *',     // daily at 04:00 UTC
        description: 'Archive evidence with elapsed retention periods',
        defaultPayload: {},
    },
    {
        name: 'notification-dispatch',
        pattern: '0 7 * * *',     // daily at 07:00 UTC (single-pass: runs monitors internally)
        description: 'Single-pass pipeline: run all monitors → group by owner → dispatch digest notifications. Replaces separate monitor+dispatch schedule to prevent duplicate DB scans.',
        defaultPayload: {},
    },
];

