/**
 * Job Types — Typed Payload Contracts
 *
 * Every async job in the system is defined here with a unique name,
 * a serialization-safe payload interface, and default queue options.
 *
 * Rules:
 *   1. Job names are string literals (no enums — easier to grep/trace)
 *   2. Payloads MUST be JSON-serializable (no Date objects, no functions, no classes)
 *   3. Each job name maps to exactly one payload type via JobPayloadMap
 *   4. Add new jobs by extending JobPayloadMap + registering a processor
 *
 * @module app-layer/jobs/types
 */

// ─── Job Payload Definitions ───

/** Health check / smoke test job */
export interface HealthCheckPayload {
    /** ISO timestamp of when the job was enqueued */
    enqueuedAt: string;
    /** Optional message for testing */
    message?: string;
}

/** Automation runner — executes scheduled control checks */
export interface AutomationRunnerPayload {
    tenantId?: string;
    dryRun?: boolean;
}

/** Daily evidence expiry — sweeps and notifies */
export interface DailyEvidenceExpiryPayload {
    tenantId?: string;
    skipOutbox?: boolean;
}

/** Data lifecycle — retention sweep and purge */
export interface DataLifecyclePayload {
    tenantId?: string;
    dryRun?: boolean;
}

/** Policy review reminder */
export interface PolicyReviewReminderPayload {
    tenantId?: string;
}

/** Evidence retention sweep */
export interface RetentionSweepPayload {
    tenantId?: string;
    dryRun?: boolean;
}

/** Webhook-driven sync pull */
export interface SyncPullPayload {
    ctx: {
        tenantId: string;
        userId: string;
        requestId: string;
        role: string;
        permissions: {
            canRead: boolean;
            canWrite: boolean;
            canAdmin: boolean;
            canAudit: boolean;
            canExport: boolean;
        };
    };
    mappingKey: {
        tenantId: string;
        provider: string;
        connectionId?: string;
        localEntityType: string;
        localEntityId: string;
        remoteEntityType: string;
        remoteEntityId: string;
    };
    remoteData: Record<string, unknown>;
    remoteUpdatedAtIso: string;
}

// ─── Job Name → Payload Map ───

/**
 * Central registry of all job names and their corresponding payload types.
 * This is the single source of truth for job typing across the system.
 *
 * To add a new job:
 *   1. Define a payload interface above
 *   2. Add an entry to this map
 *   3. Register a processor in the worker
 */
export interface JobPayloadMap {
    'health-check': HealthCheckPayload;
    'automation-runner': AutomationRunnerPayload;
    'daily-evidence-expiry': DailyEvidenceExpiryPayload;
    'data-lifecycle': DataLifecyclePayload;
    'policy-review-reminder': PolicyReviewReminderPayload;
    'retention-sweep': RetentionSweepPayload;
    'sync-pull': SyncPullPayload;
}

/** Union of all valid job names */
export type JobName = keyof JobPayloadMap;

/** Extract the payload type for a given job name */
export type JobPayload<T extends JobName> = JobPayloadMap[T];

// ─── Default Queue Options ───

/** Default retry/backoff settings per job */
export const JOB_DEFAULTS: Record<JobName, {
    attempts: number;
    backoff: { type: 'exponential' | 'fixed'; delay: number };
    removeOnComplete: number | boolean;
    removeOnFail: number | boolean;
}> = {
    'health-check': {
        attempts: 1,
        backoff: { type: 'fixed', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 200,
    },
    'automation-runner': {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 500,
        removeOnFail: 1000,
    },
    'daily-evidence-expiry': {
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: 200,
        removeOnFail: 500,
    },
    'data-lifecycle': {
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: 200,
        removeOnFail: 500,
    },
    'policy-review-reminder': {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 200,
        removeOnFail: 500,
    },
    'retention-sweep': {
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: 200,
        removeOnFail: 500,
    },
    'sync-pull': {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100, // Important for dedupe: allow same id after completion
        removeOnFail: 500,
    },
};

/** The single queue name used for all jobs (BullMQ supports named jobs within a queue) */
export const QUEUE_NAME = 'inflect-jobs';
