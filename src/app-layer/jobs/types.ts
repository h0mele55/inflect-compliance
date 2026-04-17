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
 * TENANT ISOLATION (CRITICAL):
 *   5. Every tenant-scoped payload MUST include `tenantId?: string`
 *   6. Executors MUST pass payload.tenantId to the service layer
 *   7. Services MUST apply tenantId to ALL Prisma where clauses
 *   8. NEVER use `_payload` (unused parameter) in executors — this silently
 *      drops tenantId and causes all-tenant scans
 *   9. Regression tests in `tests/unit/job-tenant-isolation-regression.test.ts`
 *      enforce these rules automatically
 *
 * @module app-layer/jobs/types
 */

// ─── Unified Job Run Result ───

/**
 * Universal result contract returned by every scheduled job executor.
 * Provides a consistent shape for observability, logging, and
 * downstream consumers (dashboards, audit logs, alerting).
 *
 * All fields are JSON-serializable.
 */
export interface JobRunResult {
    /** The job name that produced this result */
    jobName: string;
    /** Unique identifier for this particular execution */
    jobRunId: string;
    /** Whether the job completed without throwing */
    success: boolean;
    /** ISO timestamp of when execution started */
    startedAt: string;
    /** ISO timestamp of when execution finished */
    completedAt: string;
    /** Execution duration in milliseconds */
    durationMs: number;
    /** Number of items scanned/inspected during the run */
    itemsScanned: number;
    /** Number of items that triggered an action (e.g. notified, archived, purged) */
    itemsActioned: number;
    /** Number of items skipped (duplicate, already processed, etc.) */
    itemsSkipped: number;
    /** Optional error message if success=false */
    errorMessage?: string;
    /** Optional structured details (job-specific payload) */
    details?: Record<string, unknown>;
}

// ─── Normalized Due Item Output ───

/**
 * Entity types that can have due/expiring items.
 * Used for downstream notification grouping.
 */
export type MonitoredEntityType =
    | 'CONTROL'
    | 'EVIDENCE'
    | 'POLICY'
    | 'VENDOR'
    | 'TASK'
    | 'RISK'
    | 'TEST_PLAN';

/**
 * Urgency classification for due items.
 *   OVERDUE  — already past its deadline
 *   URGENT   — within 7 days
 *   UPCOMING — within 30 days
 */
export type DueItemUrgency = 'OVERDUE' | 'URGENT' | 'UPCOMING';

/**
 * Normalized due/expiring item — the universal output of all monitors.
 *
 * Designed for downstream consumption:
 *   - Group by tenantId + ownerUserId → per-user digest
 *   - Group by entityType → summary dashboards
 *   - All fields are JSON-serializable
 */
export interface DueItem {
    /** Entity type being monitored */
    entityType: MonitoredEntityType;
    /** Database ID of the entity */
    entityId: string;
    /** Tenant that owns this entity */
    tenantId: string;
    /** Human-readable name/title */
    name: string;
    /** Specific reason this item is flagged */
    reason: string;
    /** Urgency classification */
    urgency: DueItemUrgency;
    /** The date that drives this due item (ISO string) */
    dueDate: string;
    /** Days remaining (negative = overdue) */
    daysRemaining: number;
    /** Owner user ID (for notification routing), if known */
    ownerUserId?: string;
}

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

/** Vendor renewal/review deadline monitor */
export interface VendorRenewalCheckPayload {
    tenantId?: string;
}

/** Deadline monitor — controls, policies, tasks, risks, test plans */
export interface DeadlineMonitorPayload {
    tenantId?: string;
    /** Detection windows in days. Default: [30, 7, 1] */
    windows?: number[];
}

/** Evidence expiry monitor — expiring/expired evidence detection */
export interface EvidenceExpiryMonitorPayload {
    tenantId?: string;
    /** Detection windows in days. Default: [30, 7, 1] */
    windows?: number[];
}

/** Notification dispatch — monitor → grouped digest → outbox pipeline */
export interface NotificationDispatchPayload {
    tenantId?: string;
    /** Which categories to dispatch. Default: all */
    categories?: ('DEADLINE_DIGEST' | 'EVIDENCE_EXPIRY_DIGEST' | 'VENDOR_RENEWAL_DIGEST')[];
    /** Detection windows in days. Default: [30, 7, 1] */
    windows?: number[];
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
    'vendor-renewal-check': VendorRenewalCheckPayload;
    'deadline-monitor': DeadlineMonitorPayload;
    'evidence-expiry-monitor': EvidenceExpiryMonitorPayload;
    'notification-dispatch': NotificationDispatchPayload;
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
    'vendor-renewal-check': {
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: 200,
        removeOnFail: 500,
    },
    'deadline-monitor': {
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: 200,
        removeOnFail: 500,
    },
    'evidence-expiry-monitor': {
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: 200,
        removeOnFail: 500,
    },
    'notification-dispatch': {
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
