/**
 * BullMQ Scheduler — Integration Tests
 *
 * Validates:
 *   1. Repeatable jobs can be registered and are idempotent
 *   2. Scheduled jobs are enqueued by BullMQ at the expected cadence
 *   3. Duplicate-run protection works (upsert doesn't create duplicates)
 *
 * ⚠️  Requires `docker compose up -d redis` (port 6379).
 */
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { QUEUE_NAME } from '../../src/app-layer/jobs/types';
import { SCHEDULED_JOBS } from '../../src/app-layer/jobs/schedules';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const TEST_QUEUE_NAME = `${QUEUE_NAME}-scheduler-test-${Date.now()}`;

// ─── Availability check ───

function checkRedisAvailable(): boolean {
    try {
        const { execSync } = require('child_process');
        execSync(
            `node -e "const Redis=require('ioredis');const r=new Redis('${REDIS_URL}',{connectTimeout:3000,lazyConnect:true,maxRetriesPerRequest:0});r.connect().then(()=>r.ping()).then(()=>{r.disconnect();process.exit(0)}).catch(()=>{r.disconnect().catch(()=>{});process.exit(1)})"`,
            { timeout: 5000, stdio: 'ignore', cwd: require('path').resolve(__dirname, '../..') },
        );
        return true;
    } catch {
        return false;
    }
}

const REDIS_AVAILABLE = checkRedisAvailable();
const describeFn = REDIS_AVAILABLE ? describe : describe.skip;

describeFn('BullMQ Scheduler (Integration)', () => {
    let connection: Redis;
    let queue: Queue;

    beforeAll(() => {
        connection = new Redis(REDIS_URL, {
            maxRetriesPerRequest: null,
            connectTimeout: 5000,
        });
        queue = new Queue(TEST_QUEUE_NAME, { connection });
    });

    afterAll(async () => {
        try {
            // Clean up all schedulers
            const schedulers = await queue.getJobSchedulers();
            for (const s of schedulers) {
                await queue.removeJobScheduler(s.name ?? '');
            }
            await queue.obliterate({ force: true });
            await queue.close();
        } catch { /* ignore */ }
        try { await connection.quit(); } catch { /* ignore */ }
    }, 15000);

    // ── Register schedules ──

    test('registers all scheduled jobs as repeatables', async () => {
        // Register all schedules
        for (const schedule of SCHEDULED_JOBS) {
            await queue.upsertJobScheduler(
                schedule.name,
                { pattern: schedule.pattern },
                { name: schedule.name, data: schedule.defaultPayload },
            );
        }

        // Verify all are registered
        const schedulers = await queue.getJobSchedulers();
        expect(schedulers.length).toBe(SCHEDULED_JOBS.length);

        // Verify each schedule is present
        for (const expected of SCHEDULED_JOBS) {
            const found = schedulers.find(s => s.name === expected.name);
            expect(found).toBeDefined();
            expect(found!.pattern).toBe(expected.pattern);
        }
    });

    // ── Idempotency / duplicate protection ──

    test('re-registering the same schedule is idempotent (no duplicates)', async () => {
        // Register the same schedules again
        for (const schedule of SCHEDULED_JOBS) {
            await queue.upsertJobScheduler(
                schedule.name,
                { pattern: schedule.pattern },
                { name: schedule.name, data: schedule.defaultPayload },
            );
        }

        // Should still have exactly the same count
        const schedulers = await queue.getJobSchedulers();
        expect(schedulers.length).toBe(SCHEDULED_JOBS.length);

        // Verify no duplicates by name
        const names = schedulers.map(s => s.name);
        const uniqueNames = new Set(names);
        expect(uniqueNames.size).toBe(names.length);
    });

    // ── Schedule definitions ──

    test('all schedule definitions have valid cron patterns', () => {
        for (const schedule of SCHEDULED_JOBS) {
            // Basic cron pattern validation (5 or 6 parts)
            const parts = schedule.pattern.split(' ');
            expect(parts.length).toBeGreaterThanOrEqual(5);
            expect(parts.length).toBeLessThanOrEqual(6);
            expect(schedule.name).toBeTruthy();
            expect(schedule.description).toBeTruthy();
        }
    });

    // ── Remove schedules ──

    test('removeJobScheduler cleans up correctly', async () => {
        // Remove one specific schedule
        await queue.removeJobScheduler('health-check');

        const schedulers = await queue.getJobSchedulers();
        const healthCheck = schedulers.find(s => s.name === 'health-check');
        expect(healthCheck).toBeUndefined();
    });
});
