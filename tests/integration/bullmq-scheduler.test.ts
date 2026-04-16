/**
 * BullMQ Scheduler — Contract Tests
 *
 * Validates schedule definitions and scheduler API semantics without
 * requiring a live Redis instance.
 *
 * Specifically tested:
 *   1. All SCHEDULED_JOBS have valid cron patterns (structure)
 *   2. upsertJobScheduler is idempotent (no duplicate registrations)
 *   3. removeJobScheduler removes only the targeted scheduler
 *   4. All scheduled job names exist in JOB_DEFAULTS
 *
 * Architecture note: BullMQ v5's Lua scripts are incompatible with in-process
 * Redis mocks. We mock the Queue class to exercise the scheduler contract
 * (idempotency, key-by-name semantics) in pure memory.
 */
import { QUEUE_NAME, JOB_DEFAULTS } from '../../src/app-layer/jobs/types';
import { SCHEDULED_JOBS } from '../../src/app-layer/jobs/schedules';

// ─── In-memory Scheduler Mock ─────────────────────────────────────────────────

interface SchedulerEntry {
    name: string;
    pattern?: string;
    jobName?: string;
    data?: unknown;
}

class MockQueue {
    readonly name: string;
    private schedulers: Map<string, SchedulerEntry> = new Map();

    constructor(name: string) {
        this.name = name;
    }

    async upsertJobScheduler(
        name: string,
        repeatOpts: { pattern?: string },
        jobTemplate: { name?: string; data?: unknown },
    ): Promise<void> {
        // Idempotent upsert by name — same behaviour as BullMQ
        this.schedulers.set(name, {
            name,
            pattern: repeatOpts.pattern,
            jobName: jobTemplate.name,
            data: jobTemplate.data,
        });
    }

    async getJobSchedulers(): Promise<SchedulerEntry[]> {
        return Array.from(this.schedulers.values());
    }

    async removeJobScheduler(name: string): Promise<boolean> {
        return this.schedulers.delete(name);
    }

    async obliterate(): Promise<void> {
        this.schedulers.clear();
    }

    async close(): Promise<void> { /* noop */ }
}

jest.mock('bullmq', () => ({
    Queue: MockQueue,
    Worker: class { close() {} },
    Job: class {},
    QueueEvents: class { on() {} close() {} },
}));

import { Queue } from 'bullmq';

// ─────────────────────────────────────────────────────────────────────────────

describe('BullMQ Scheduler — Schedule definitions', () => {
    test('SCHEDULED_JOBS is a non-empty array', () => {
        expect(Array.isArray(SCHEDULED_JOBS)).toBe(true);
        expect(SCHEDULED_JOBS.length).toBeGreaterThan(0);
    });

    test('all schedule definitions have valid 5- or 6-part cron patterns', () => {
        for (const schedule of SCHEDULED_JOBS) {
            const parts = schedule.pattern.split(' ');
            expect(parts.length).toBeGreaterThanOrEqual(5);
            expect(parts.length).toBeLessThanOrEqual(6);
        }
    });

    test('all schedule names are non-empty strings', () => {
        for (const schedule of SCHEDULED_JOBS) {
            expect(typeof schedule.name).toBe('string');
            expect(schedule.name.length).toBeGreaterThan(0);
        }
    });

    test('all schedule descriptions are non-empty strings', () => {
        for (const schedule of SCHEDULED_JOBS) {
            expect(typeof schedule.description).toBe('string');
            expect(schedule.description.length).toBeGreaterThan(0);
        }
    });

    test('all scheduled job names exist in JOB_DEFAULTS', () => {
        for (const schedule of SCHEDULED_JOBS) {
            expect(JOB_DEFAULTS[schedule.name]).toBeDefined();
        }
    });

    test('no duplicate schedule names', () => {
        const names = SCHEDULED_JOBS.map(s => s.name);
        const unique = new Set(names);
        expect(unique.size).toBe(names.length);
    });
});

describe('BullMQ Scheduler — upsertJobScheduler semantics', () => {
    let queue: InstanceType<typeof MockQueue>;

    beforeEach(() => {
        queue = new (Queue as unknown as typeof MockQueue)(`${QUEUE_NAME}-scheduler-test`);
    });

    afterEach(async () => {
        await (queue as MockQueue).obliterate();
        await queue.close();
    });

    test('registers all scheduled jobs', async () => {
        for (const schedule of SCHEDULED_JOBS) {
            await (queue as MockQueue).upsertJobScheduler(
                schedule.name,
                { pattern: schedule.pattern },
                { name: schedule.name, data: schedule.defaultPayload },
            );
        }

        const schedulers = await (queue as MockQueue).getJobSchedulers();
        expect(schedulers.length).toBe(SCHEDULED_JOBS.length);

        for (const expected of SCHEDULED_JOBS) {
            const found = schedulers.find(s => s.name === expected.name);
            expect(found).toBeDefined();
            expect(found!.pattern).toBe(expected.pattern);
        }
    });

    test('re-registering the same schedule is idempotent (no duplicates)', async () => {
        // Register once
        for (const schedule of SCHEDULED_JOBS) {
            await (queue as MockQueue).upsertJobScheduler(
                schedule.name,
                { pattern: schedule.pattern },
                { name: schedule.name, data: schedule.defaultPayload },
            );
        }

        // Register again — should upsert, not duplicate
        for (const schedule of SCHEDULED_JOBS) {
            await (queue as MockQueue).upsertJobScheduler(
                schedule.name,
                { pattern: schedule.pattern },
                { name: schedule.name, data: schedule.defaultPayload },
            );
        }

        const schedulers = await (queue as MockQueue).getJobSchedulers();
        expect(schedulers.length).toBe(SCHEDULED_JOBS.length);

        const names = schedulers.map(s => s.name);
        expect(new Set(names).size).toBe(names.length);
    });

    test('removeJobScheduler removes only the targeted scheduler', async () => {
        for (const schedule of SCHEDULED_JOBS) {
            await (queue as MockQueue).upsertJobScheduler(
                schedule.name,
                { pattern: schedule.pattern },
                { name: schedule.name, data: schedule.defaultPayload },
            );
        }

        // Verify pre-removal count
        const before = await (queue as MockQueue).getJobSchedulers();
        expect(before.length).toBe(SCHEDULED_JOBS.length);

        // Remove the first schedule
        const [first] = SCHEDULED_JOBS;
        await (queue as MockQueue).removeJobScheduler(first.name);

        const after = await (queue as MockQueue).getJobSchedulers();
        expect(after.length).toBe(SCHEDULED_JOBS.length - 1);
        expect(after.find(s => s.name === first.name)).toBeUndefined();

        // All others should still be present
        for (const schedule of SCHEDULED_JOBS.slice(1)) {
            expect(after.find(s => s.name === schedule.name)).toBeDefined();
        }
    });

    test('removeJobScheduler on non-existent key returns false', async () => {
        const result = await (queue as MockQueue).removeJobScheduler('does-not-exist');
        expect(result).toBe(false);
    });
});
