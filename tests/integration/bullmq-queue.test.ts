/**
 * BullMQ Queue — Integration Tests
 *
 * Validates end-to-end: enqueue → dequeue → process via the health-check job.
 * Tests are automatically skipped if Redis is not running.
 *
 * ⚠️  Requires `docker compose up -d redis` (port 6379).
 */
import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { QUEUE_NAME, JOB_DEFAULTS } from '../../src/app-layer/jobs/types';
import type { HealthCheckPayload } from '../../src/app-layer/jobs/types';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const TEST_QUEUE_NAME = `${QUEUE_NAME}-test-${Date.now()}`;

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

describeFn('BullMQ Queue (Integration)', () => {
    let queueConnection: Redis;
    let queue: Queue;
    const cleanup: Array<{ close: () => Promise<unknown> }> = [];

    beforeAll(() => {
        queueConnection = new Redis(REDIS_URL, {
            maxRetriesPerRequest: null,
            connectTimeout: 5000,
        });
        queue = new Queue(TEST_QUEUE_NAME, { connection: queueConnection });
        cleanup.push(queue);
    });

    afterAll(async () => {
        // Close all tracked resources in reverse order
        for (const resource of cleanup.reverse()) {
            try { await resource.close(); } catch { /* ignore */ }
        }
        // Obliterate test queue keys
        try {
            const tempQueue = new Queue(TEST_QUEUE_NAME, {
                connection: new Redis(REDIS_URL, { maxRetriesPerRequest: null }),
            });
            await tempQueue.obliterate({ force: true });
            await tempQueue.close();
        } catch { /* ignore */ }
        try { await queueConnection.quit(); } catch { /* ignore */ }
    }, 15000);

    // ── Enqueue ──

    test('enqueue creates a job in the queue', async () => {
        const payload: HealthCheckPayload = {
            enqueuedAt: new Date().toISOString(),
            message: 'integration-test',
        };

        const job = await queue.add('health-check', payload, {
            ...JOB_DEFAULTS['health-check'],
        });

        expect(job.id).toBeDefined();
        expect(job.name).toBe('health-check');
        expect(job.data).toEqual(payload);

        // Verify the job exists in Redis
        const fetched = await queue.getJob(job.id!);
        expect(fetched).toBeDefined();
        expect(fetched!.data.message).toBe('integration-test');
    });

    // ── Job defaults ──

    test('job defaults are applied correctly', async () => {
        const job = await queue.add('health-check', {
            enqueuedAt: new Date().toISOString(),
        }, {
            ...JOB_DEFAULTS['health-check'],
        });

        expect(job.opts.attempts).toBe(JOB_DEFAULTS['health-check'].attempts);
        expect(job.opts.backoff).toEqual(JOB_DEFAULTS['health-check'].backoff);
    });

    // ── Multiple job types ──

    test('queue supports multiple job names', async () => {
        const job1 = await queue.add('health-check', { enqueuedAt: new Date().toISOString() });
        const job2 = await queue.add('automation-runner', { tenantId: 'test' });

        expect(job1.name).toBe('health-check');
        expect(job2.name).toBe('automation-runner');
        expect(job1.id).not.toBe(job2.id);
    });
});

/**
 * Separate describe block for the round-trip test so it uses
 * a completely fresh queue with no leftover jobs.
 */
describeFn('BullMQ Worker Round-Trip (Integration)', () => {
    const ROUNDTRIP_QUEUE = `${QUEUE_NAME}-roundtrip-${Date.now()}`;
    let connection: Redis;
    let workerConnection: Redis;
    let queue: Queue;
    let worker: Worker;

    beforeAll(() => {
        connection = new Redis(REDIS_URL, {
            maxRetriesPerRequest: null,
            connectTimeout: 5000,
        });
        workerConnection = new Redis(REDIS_URL, {
            maxRetriesPerRequest: null,
            connectTimeout: 5000,
        });
        queue = new Queue(ROUNDTRIP_QUEUE, { connection });

        worker = new Worker(
            ROUNDTRIP_QUEUE,
            async (job: Job<HealthCheckPayload>) => {
                return {
                    status: 'ok',
                    processedAt: new Date().toISOString(),
                    message: job.data.message,
                };
            },
            { connection: workerConnection },
        );
    });

    afterAll(async () => {
        try { await worker.close(); } catch { /* ignore */ }
        try {
            await queue.obliterate({ force: true });
            await queue.close();
        } catch { /* ignore */ }
        try { await connection.quit(); } catch { /* ignore */ }
        try { await workerConnection.quit(); } catch { /* ignore */ }
    }, 15000);

    test('worker processes enqueued job end-to-end', async () => {
        // Wait until worker is ready
        await worker.waitUntilReady();

        const payload: HealthCheckPayload = {
            enqueuedAt: new Date().toISOString(),
            message: 'round-trip-test',
        };

        const job = await queue.add('health-check', payload);

        // Poll for completion (simpler than event-based, more reliable in tests)
        let completed = false;
        let result: unknown;
        for (let i = 0; i < 50; i++) {
            const state = await job.getState();
            if (state === 'completed') {
                completed = true;
                result = job.returnvalue;
                break;
            }
            if (state === 'failed') {
                throw new Error(`Job failed: ${job.failedReason}`);
            }
            await new Promise(r => setTimeout(r, 200));
        }

        expect(completed).toBe(true);
        // Re-fetch to get return value
        const finishedJob = await queue.getJob(job.id!);
        expect(finishedJob).toBeDefined();
        expect(finishedJob!.returnvalue).toMatchObject({
            status: 'ok',
            message: 'round-trip-test',
        });
    }, 15000);
});
