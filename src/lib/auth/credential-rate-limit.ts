/**
 * Per-identifier (email) rate limiting for the credentials auth path.
 *
 * Sits alongside the per-IP NextAuth middleware
 * (`src/lib/rate-limit/authRateLimit.ts`, 10/min per IP). That middleware
 * catches volumetric abuse from a single source; this module catches
 * credential-stuffing where the attacker rotates IPs but hammers a
 * single account. Both run on the same login request.
 *
 * Policy:
 *   - 5 failed attempts per 15-minute sliding window per email address
 *   - Successful auth resets the counter (via {@link resetCredentialsBackoff})
 *   - Key is SHA-256(lowercased-trimmed email) — never the raw address,
 *     so the rate-limit cache can't be scraped to enumerate accounts
 *   - When `AUTH_TEST_MODE=1` the check is a no-op (keeps E2E test runs
 *     from tripping themselves), matching the convention in
 *     `authRateLimit.ts`
 *   - Fails OPEN on Redis error, matching the existing module — better
 *     to let a legit user through than to brick logins across the fleet
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { env } from '@/env';
import { edgeLogger } from '@/lib/observability/edge-logger';

// ── Policy ─────────────────────────────────────────────────────────────

export const CREDENTIALS_RATE_LIMIT = {
    maxAttempts: 5,
    windowSeconds: 15 * 60, // 15 minutes
} as const;

// ── Upstash / memory fallback (same pattern as authRateLimit.ts) ──────

let _limiter: Ratelimit | null = null;
let _initialized = false;

function initLimiter() {
    if (_initialized) return;
    _initialized = true;
    if (env.RATE_LIMIT_MODE !== 'upstash') return;
    try {
        const redis = Redis.fromEnv();
        _limiter = new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(
                CREDENTIALS_RATE_LIMIT.maxAttempts,
                `${CREDENTIALS_RATE_LIMIT.windowSeconds} s`,
            ),
            analytics: false,
        });
    } catch (err) {
        edgeLogger.error('Failed to init credential rate-limit Upstash', {
            component: 'rate-limit',
            err: String(err),
        });
    }
}

// Memory fallback — shared across the process. Sliding window is approximated
// as a fixed-window bucket; good enough for dev and CI.
const _memoryAttempts = new Map<string, { count: number; expiresAt: number }>();

// ── Identifier key ─────────────────────────────────────────────────────

/** Hex SHA-256 of the normalised email. Never store plaintext email as a cache key. */
async function hashIdentifier(email: string): Promise<string> {
    const normalised = (email ?? '').trim().toLowerCase();
    const encoder = new TextEncoder();
    const data = encoder.encode(normalised);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

// ── Public contract ────────────────────────────────────────────────────

export type CredentialsRateLimitDecision =
    | { ok: true }
    | { ok: false; retryAfterSeconds: number };

/**
 * Check whether the caller is allowed to attempt a login for this email.
 * Call BEFORE hitting bcrypt — the point of this check is to short-
 * circuit the expensive verify work for hammered accounts.
 *
 * A call counts toward the limit. Successful auth should call
 * {@link resetCredentialsBackoff} to clear the bucket so a legitimate
 * user isn't permanently blocked after 5 typos.
 */
export async function checkCredentialsAttempt(
    email: string,
): Promise<CredentialsRateLimitDecision> {
    // E2E tests + explicit kill-switch short-circuit the check. Keep this
    // in lockstep with `authRateLimit.ts` so operators have one flag to
    // pull if the limiter misbehaves in prod.
    if (env.AUTH_TEST_MODE === '1' || env.RATE_LIMIT_ENABLED === '0') {
        return { ok: true };
    }

    const ident = await hashIdentifier(email).catch(() => '');
    if (!ident) {
        // crypto.subtle unavailable (shouldn't happen on modern Node/edge).
        // Fail open — same policy as the upstream IP limiter.
        return { ok: true };
    }

    const key = `rl:cred:id:${ident}`;

    initLimiter();
    try {
        if (_limiter) {
            const result = await _limiter.limit(key);
            if (result.success) return { ok: true };
            return {
                ok: false,
                retryAfterSeconds: Math.max(
                    1,
                    Math.ceil((result.reset - Date.now()) / 1000),
                ),
            };
        }

        // Memory fallback
        const now = Date.now();
        const windowMs = CREDENTIALS_RATE_LIMIT.windowSeconds * 1000;
        let bucket = _memoryAttempts.get(key);
        if (!bucket || bucket.expiresAt <= now) {
            bucket = { count: 0, expiresAt: now + windowMs };
        }
        bucket.count += 1;
        _memoryAttempts.set(key, bucket);
        if (bucket.count <= CREDENTIALS_RATE_LIMIT.maxAttempts) {
            return { ok: true };
        }
        return {
            ok: false,
            retryAfterSeconds: Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000)),
        };
    } catch (err) {
        // Fail open on infrastructure error.
        edgeLogger.warn('Credential rate-limit check failed; failing open', {
            component: 'rate-limit',
            err: String(err),
        });
        return { ok: true };
    }
}

/**
 * Clear the per-email counter after a successful login. Without this a
 * legitimate user who typo'd their password 5 times gets locked out for
 * 15 minutes even after getting it right — unnecessary friction, and
 * counterproductive against credential stuffing (an attacker who just
 * GOT the correct creds doesn't need more attempts).
 *
 * Upstash sliding-window doesn't support per-key delete without a
 * separate Redis call, so the memory fallback clears the bucket but
 * Upstash mode intentionally doesn't — the counter will age out of the
 * sliding window naturally within 15 minutes. This is a deliberate
 * simplification; if it becomes a UX issue we can add a `redis.del()`
 * call here using the `Redis.fromEnv()` singleton.
 */
export async function resetCredentialsBackoff(email: string): Promise<void> {
    const ident = await hashIdentifier(email).catch(() => '');
    if (!ident) return;
    const key = `rl:cred:id:${ident}`;
    _memoryAttempts.delete(key);
}

/**
 * Test-only helper: wipes the in-memory counters. No effect on Upstash.
 * Exported instead of reaching into `_memoryAttempts` from tests so the
 * private state stays private.
 */
export function __resetCredentialsRateLimitForTests(): void {
    _memoryAttempts.clear();
}
