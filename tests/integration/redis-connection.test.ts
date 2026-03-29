/**
 * Redis Connection — Integration Tests
 *
 * Validates the Redis connection helper against a live Redis instance.
 * Tests are automatically skipped if Redis is not running.
 *
 * ⚠️  Requires `docker compose up -d redis` (port 6379).
 *     For test environment: `docker compose -f docker-compose.test.yml up -d redis-test` (port 6380).
 */
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// ─── Synchronous availability check ───

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

describeFn('Redis Connection (Integration)', () => {
    let redis: Redis;

    beforeAll(async () => {
        redis = new Redis(REDIS_URL, {
            connectTimeout: 5000,
            maxRetriesPerRequest: 0,
            lazyConnect: true,
        });
        await redis.connect();
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

        // TTL should be positive
        const ttl = await redis.ttl(key);
        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(2);
    });

    // ── Hash operations (useful for caching) ──

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

    // ── List operations (useful for job queues) ──

    test('LPUSH/RPOP list operations work', async () => {
        const key = `test:redis-integration:list-${Date.now()}`;

        await redis.lpush(key, 'c', 'b', 'a');
        const first = await redis.rpop(key);
        const second = await redis.rpop(key);
        const third = await redis.rpop(key);

        expect(first).toBe('c');
        expect(second).toBe('b');
        expect(third).toBe('a');
    });

    // ── Connection info ──

    test('INFO returns server information', async () => {
        const info = await redis.info('server');
        expect(info).toContain('redis_version');
    });
});

// ── Helper behavior tests (don't need Redis running) ──

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
