/**
 * Redis Connection Helper — Shared Singleton
 *
 * Provides a single, reusable ioredis client for the entire application.
 * Used by jobs (BullMQ), caching, rate limiting, and async coordination.
 *
 * Design decisions:
 *   - Singleton cached on `globalThis` to survive HMR in Next.js dev mode
 *   - Lazy connect: client is created on first `getRedis()` call
 *   - Optional: returns `null` when REDIS_URL is not configured (graceful degradation)
 *   - BullMQ-compatible: BullMQ accepts ioredis instances directly
 *   - Safe disconnect for tests and graceful shutdown
 *
 * Usage:
 *   import { getRedis, getRedisOrThrow, isRedisAvailable } from '@/lib/redis';
 *
 *   // Optional — returns null if Redis not configured
 *   const redis = getRedis();
 *   if (redis) await redis.set('key', 'value');
 *
 *   // Required — throws if Redis not available
 *   const redis = getRedisOrThrow();
 *   await redis.set('key', 'value');
 *
 *   // BullMQ usage (future):
 *   const queue = new Queue('jobs', { connection: getRedisOrThrow() });
 *
 * @module lib/redis
 */
import Redis from 'ioredis';
import { logger } from '@/lib/observability/logger';

// ─── Global singleton (survives HMR in dev) ───

const globalForRedis = globalThis as unknown as {
    __redis_client?: Redis | null;
    __redis_url?: string;
};

/**
 * Returns the shared Redis client, or `null` if REDIS_URL is not configured.
 *
 * The client is created lazily on first call and cached globally.
 * Subsequent calls return the same instance.
 */
export function getRedis(): Redis | null {
    const url = process.env.REDIS_URL;
    if (!url) return null;

    // If URL changed (dev hot-reload), disconnect old client
    if (globalForRedis.__redis_client && globalForRedis.__redis_url !== url) {
        globalForRedis.__redis_client.disconnect();
        globalForRedis.__redis_client = undefined;
    }

    if (!globalForRedis.__redis_client) {
        const client = new Redis(url, {
            // ── Connection behavior ──
            maxRetriesPerRequest: null,     // Required for BullMQ compatibility
            enableReadyCheck: true,
            retryStrategy(times: number) {
                // Exponential backoff: 50ms, 100ms, 200ms... capped at 5s
                const delay = Math.min(times * 50, 5000);
                return delay;
            },
            // ── Timeouts ──
            connectTimeout: 10000,          // 10s to establish connection
            commandTimeout: 5000,           // 5s per command
            // ── Naming ──
            connectionName: 'inflect-app',
            lazyConnect: false,             // Connect immediately when created
        });

        client.on('connect', () => {
            logger.info('Redis connected', { component: 'redis', url: redactUrl(url) });
        });

        client.on('ready', () => {
            logger.info('Redis ready', { component: 'redis' });
        });

        client.on('error', (err) => {
            logger.error('Redis connection error', {
                component: 'redis',
                err: err instanceof Error ? err : new Error(String(err)),
            });
        });

        client.on('close', () => {
            logger.info('Redis connection closed', { component: 'redis' });
        });

        globalForRedis.__redis_client = client;
        globalForRedis.__redis_url = url;
    }

    return globalForRedis.__redis_client;
}

/**
 * Returns the shared Redis client.
 * Throws if REDIS_URL is not configured or client creation failed.
 */
export function getRedisOrThrow(): Redis {
    const client = getRedis();
    if (!client) {
        throw new Error(
            'Redis is not available. Set REDIS_URL environment variable. ' +
            'Run `docker compose up -d redis` to start the local Redis container.'
        );
    }
    return client;
}

/**
 * Quick readiness check — returns true if Redis is configured and connected.
 */
export async function isRedisAvailable(): Promise<boolean> {
    try {
        const client = getRedis();
        if (!client) return false;
        const result = await client.ping();
        return result === 'PONG';
    } catch {
        return false;
    }
}

/**
 * Disconnect the shared Redis client.
 * Used for clean shutdown in tests and graceful process exit.
 */
export async function disconnectRedis(): Promise<void> {
    if (globalForRedis.__redis_client) {
        await globalForRedis.__redis_client.quit();
        globalForRedis.__redis_client = undefined;
        globalForRedis.__redis_url = undefined;
    }
}

/**
 * Create a NEW Redis client (not the singleton).
 * Use this when you need an isolated connection (e.g. BullMQ workers
 * need separate pub/sub connections).
 *
 * Caller is responsible for disconnecting.
 */
export function createRedisClient(overrideUrl?: string): Redis {
    const url = overrideUrl || process.env.REDIS_URL;
    if (!url) {
        throw new Error('REDIS_URL is not configured');
    }
    return new Redis(url, {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
        connectTimeout: 10000,
        commandTimeout: 5000,
        connectionName: 'inflect-worker',
        lazyConnect: false,
    });
}

// ─── Internal helpers ───

/** Redact password from redis:// URL for logging */
function redactUrl(url: string): string {
    try {
        const parsed = new URL(url);
        if (parsed.password) {
            parsed.password = '***';
        }
        return parsed.toString();
    } catch {
        return 'redis://***';
    }
}
