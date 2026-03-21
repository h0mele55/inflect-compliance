/**
 * AI Risk Assessment — Rate Limiter
 *
 * In-memory rate limiting for AI generation requests.
 * Limits by tenant (daily quota) and by user (per-minute burst).
 *
 * For production, replace with Redis-backed limiter.
 * This implementation is safe for single-instance deployments.
 */
import { rateLimited } from '@/lib/errors/types';
import { env } from '@/env';

// ─── Configuration ───

/** Max AI generation requests per tenant per day */
const TENANT_DAILY_QUOTA = parseInt(env.AI_RISK_DAILY_QUOTA ?? '50', 10);

/** Max AI generation requests per user per minute (burst protection) */
const USER_PER_MINUTE_LIMIT = parseInt(env.AI_RISK_USER_RPM ?? '5', 10);

// ─── In-Memory Stores ───

interface RateBucket {
    count: number;
    resetAt: number; // Unix timestamp in ms
}

const tenantDailyBuckets = new Map<string, RateBucket>();
const userMinuteBuckets = new Map<string, RateBucket>();

/**
 * Get or create a rate bucket, resetting if expired.
 */
function getBucket(store: Map<string, RateBucket>, key: string, windowMs: number): RateBucket {
    const now = Date.now();
    const existing = store.get(key);
    if (existing && existing.resetAt > now) {
        return existing;
    }
    const bucket: RateBucket = { count: 0, resetAt: now + windowMs };
    store.set(key, bucket);
    return bucket;
}

// ─── Rate Check ───

/**
 * Check rate limits for an AI generation request.
 * Throws `rateLimited` AppError (HTTP 429) if limits are exceeded.
 *
 * Call this BEFORE generating suggestions.
 */
export function checkRateLimit(tenantId: string, userId: string): void {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const ONE_MINUTE_MS = 60 * 1000;

    // 1. Tenant daily quota
    const tenantBucket = getBucket(tenantDailyBuckets, tenantId, ONE_DAY_MS);
    if (tenantBucket.count >= TENANT_DAILY_QUOTA) {
        const resetIn = Math.ceil((tenantBucket.resetAt - Date.now()) / 1000 / 60);
        throw rateLimited(
            `AI assessment daily limit reached (${TENANT_DAILY_QUOTA}/day). Resets in ~${resetIn} minutes.`
        );
    }

    // 2. User per-minute burst limit
    const userKey = `${tenantId}:${userId}`;
    const userBucket = getBucket(userMinuteBuckets, userKey, ONE_MINUTE_MS);
    if (userBucket.count >= USER_PER_MINUTE_LIMIT) {
        throw rateLimited(
            `Too many AI assessment requests. Please wait a moment before trying again.`
        );
    }
}

/**
 * Record a successful generation (increment counters).
 * Call this AFTER a successful generation.
 */
export function recordGeneration(tenantId: string, userId: string): void {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const ONE_MINUTE_MS = 60 * 1000;

    const tenantBucket = getBucket(tenantDailyBuckets, tenantId, ONE_DAY_MS);
    tenantBucket.count += 1;

    const userKey = `${tenantId}:${userId}`;
    const userBucket = getBucket(userMinuteBuckets, userKey, ONE_MINUTE_MS);
    userBucket.count += 1;
}

/**
 * Get current usage info for a tenant (for UI display).
 */
export function getUsageInfo(tenantId: string): { used: number; limit: number; resetAt: number | null } {
    const bucket = tenantDailyBuckets.get(tenantId);
    if (!bucket || bucket.resetAt <= Date.now()) {
        return { used: 0, limit: TENANT_DAILY_QUOTA, resetAt: null };
    }
    return { used: bucket.count, limit: TENANT_DAILY_QUOTA, resetAt: bucket.resetAt };
}

/**
 * Reset rate limits (for testing).
 */
export function _resetForTesting(): void {
    tenantDailyBuckets.clear();
    userMinuteBuckets.clear();
}

// Export constants for test assertions
export const LIMITS = {
    TENANT_DAILY_QUOTA,
    USER_PER_MINUTE_LIMIT,
} as const;
