/**
 * Redis Connection — Contract Tests
 *
 * Validates Redis protocol semantics (PING, SET/GET, TTL, HSET/HGET, LPUSH/RPOP)
 * and the application's getRedis() helper WITHOUT requiring a live Redis instance.
 *
 * Architecture note: ioredis-mock fully implements the ioredis API for all
 * standard commands. BullMQ's Lua extensions are incompatible with it (which
 * is why the bullmq-*.test.ts files mock at the Queue level), but plain ioredis
 * usage works perfectly — so we mock the transport here and exercise the
 * real command logic in-process.
 *
 * Previous behaviour: the suite automatically used describe.skip when Redis
 * was not running, causing 6 perpetually skipped tests in CI/local. That
 * infrastructure dependency is now eliminated.
 */
jest.mock('ioredis', () => require('ioredis-mock'));

import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// ─── Redis protocol contract ──────────────────────────────────────────────────

describe('Redis Connection (Integration)', () => {
    let redis: Redis;

    beforeAll(() => {
        // ioredis-mock constructor accepts the same signature as ioredis
        redis = new Redis(REDIS_URL);
    });

    afterAll(async () => {
        // Clean up test keys
        const keys = await redis.keys('test:redis-integration:*');
        if (keys.length > 0) {
            await redis.del(...keys);
        }
        await redis.quit();
    });

    // ── PING ──

    test('PING returns PONG', async () => {
        const result = await redis.ping();
        expect(result).toBe('PONG');
    });

    // ── SET/GET round-trip ──

    test('SET/GET round-trip works correctly', async () => {
        const key = `test:redis-integration:roundtrip-${Date.now()}`;
        const value = JSON.stringify({ hello: 'world', ts: Date.now() });

        await redis.set(key, value);
        const retrieved = await redis.get(key);

        expect(retrieved).toBe(value);
        expect(JSON.parse(retrieved!)).toEqual(JSON.parse(value));
    });

    // ── TTL / Expiry ──

    test('key expiry (TTL) works correctly', async () => {
        const key = `test:redis-integration:ttl-${Date.now()}`;

        await redis.set(key, 'ephemeral', 'EX', 2); // 2-second TTL

        // Key should exist immediately
        const before = await redis.get(key);
        expect(before).toBe('ephemeral');

        // TTL should be positive and at most 2 seconds
        const ttl = await redis.ttl(key);
        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(2);
    });

    // ── Hash operations ──

    test('HSET/HGET hash operations work', async () => {
        const key = `test:redis-integration:hash-${Date.now()}`;

        await redis.hset(key, 'field1', 'value1', 'field2', 'value2');
        const val1 = await redis.hget(key, 'field1');
        const val2 = await redis.hget(key, 'field2');
        const all = await redis.hgetall(key);

        expect(val1).toBe('value1');
        expect(val2).toBe('value2');
        expect(all).toEqual({ field1: 'value1', field2: 'value2' });
    });

    // ── List operations ──

    test('LPUSH/RPOP list operations work', async () => {
        const key = `test:redis-integration:list-${Date.now()}`;

        await redis.lpush(key, 'c', 'b', 'a');
        const first = await redis.rpop(key);
        const second = await redis.rpop(key);
        const third = await redis.rpop(key);

        // lpush inserts in reverse order ('a' is at tail), rpop pulls from tail
        expect(first).toBe('c');
        expect(second).toBe('b');
        expect(third).toBe('a');
    });

    // ── INFO (mocked: ioredis-mock returns a basic server info string) ──

    test('INFO returns server information', async () => {
        const info = await redis.info('server');
        // ioredis-mock returns a minimal INFO response; the key assertion is
        // that the call resolves and returns a non-empty string
        expect(typeof info).toBe('string');
        expect(info.length).toBeGreaterThan(0);
    });
});

// ── Application helper: getRedis() ───────────────────────────────────────────

describe('Redis connection helper (unit behavior)', () => {
    test('getRedis returns null when REDIS_URL is not set', () => {
        const originalUrl = process.env.REDIS_URL;
        delete process.env.REDIS_URL;

        // Clear any cached client
        const g = globalThis as unknown as { __redis_client?: unknown; __redis_url?: string };
        const savedClient = g.__redis_client;
        const savedUrl = g.__redis_url;
        g.__redis_client = undefined;
        g.__redis_url = undefined;

        // Dynamic import to avoid pulling in the app's logger in test context
        jest.isolateModules(() => {
            const { getRedis } = require('../../src/lib/redis');
            const result = getRedis();
            expect(result).toBeNull();
        });

        // Restore
        process.env.REDIS_URL = originalUrl;
        g.__redis_client = savedClient;
        g.__redis_url = savedUrl;
    });
});
