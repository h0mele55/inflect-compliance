/**
 * In-Memory Rate Limiter
 *
 * Simple sliding-window rate limiter for brute-force protection.
 * Uses a Map to track attempt timestamps per key (IP, userId, etc.).
 *
 * DESIGN: In-memory is appropriate for single-instance deployments.
 * For multi-instance, swap to Redis-backed limiter.
 *
 * This module is intentionally simple and dependency-free.
 */

interface RateLimitEntry {
    timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Clean up stale entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup(windowMs: number) {
    if (cleanupTimer) return;
    cleanupTimer = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of store) {
            entry.timestamps = entry.timestamps.filter(t => now - t < windowMs);
            if (entry.timestamps.length === 0) {
                store.delete(key);
            }
        }
    }, CLEANUP_INTERVAL);
    // Allow Node.js to exit even if timer is running
    if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
        cleanupTimer.unref();
    }
}

export interface RateLimitConfig {
    /** Maximum number of requests allowed in the window */
    maxAttempts: number;
    /** Window duration in milliseconds */
    windowMs: number;
    /** Optional: lockout duration in ms after max attempts exceeded */
    lockoutMs?: number;
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    retryAfterMs: number;
}

/**
 * Check if a request is within rate limits.
 *
 * @param key - Unique identifier (e.g., `mfa:${userId}`, `login:${ip}`)
 * @param config - Rate limit configuration
 * @returns Whether the request is allowed and how many attempts remain
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
    startCleanup(config.windowMs);

    const now = Date.now();
    const entry = store.get(key) || { timestamps: [] };

    // Remove timestamps outside the window
    const windowStart = now - config.windowMs;
    entry.timestamps = entry.timestamps.filter(t => t > windowStart);

    // Check lockout: if last attempt was within lockout period and at max
    if (config.lockoutMs && entry.timestamps.length >= config.maxAttempts) {
        const lastAttempt = entry.timestamps[entry.timestamps.length - 1];
        const lockoutEnd = lastAttempt + config.lockoutMs;
        if (now < lockoutEnd) {
            return {
                allowed: false,
                remaining: 0,
                retryAfterMs: lockoutEnd - now,
            };
        }
        // Lockout expired, reset
        entry.timestamps = [];
    }

    if (entry.timestamps.length >= config.maxAttempts) {
        store.set(key, entry);
        const oldestInWindow = entry.timestamps[0];
        return {
            allowed: false,
            remaining: 0,
            retryAfterMs: oldestInWindow + config.windowMs - now,
        };
    }

    // Record this attempt
    entry.timestamps.push(now);
    store.set(key, entry);

    return {
        allowed: true,
        remaining: config.maxAttempts - entry.timestamps.length,
        retryAfterMs: 0,
    };
}

/**
 * Reset rate limit for a key (e.g., after successful auth).
 */
export function resetRateLimit(key: string): void {
    store.delete(key);
}

/**
 * For testing: clear all rate limit state.
 */
export function clearAllRateLimits(): void {
    store.clear();
}

// ─── Preset Configurations ──────────────────────────────────────────

/** MFA verify: 5 attempts per 15 minutes, 5 min lockout after exhaustion */
export const MFA_VERIFY_LIMIT: RateLimitConfig = {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,     // 15 minutes
    lockoutMs: 5 * 60 * 1000,     // 5 minute lockout
};

/** MFA enrollment verify: 10 attempts per 15 minutes */
export const MFA_ENROLL_VERIFY_LIMIT: RateLimitConfig = {
    maxAttempts: 10,
    windowMs: 15 * 60 * 1000,
};
