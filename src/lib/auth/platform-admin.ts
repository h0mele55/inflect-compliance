/**
 * Epic 1, PR 2 — Platform-admin API key verification.
 *
 * Provides constant-time verification of the `X-Platform-Admin-Key`
 * request header against the `PLATFORM_ADMIN_API_KEY` environment
 * variable. Throws a `PlatformAdminError` on mismatch or when the
 * env var is unset so callers convert it to the appropriate HTTP
 * status without leaking timing information.
 *
 * This is an assertion helper — it returns `void` on success and
 * throws on failure. Callers should call it at the top of each
 * platform-admin handler before any business logic.
 */

import { env } from '@/env';
import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

const HEADER = 'x-platform-admin-key';

/**
 * Thrown by `verifyPlatformApiKey` when the request cannot proceed.
 * `status` carries the HTTP status code the route handler should
 * return (503 = key not configured, 401 = wrong / missing key).
 */
export class PlatformAdminError extends Error {
    constructor(
        public readonly status: number,
        message: string,
    ) {
        super(message);
        this.name = 'PlatformAdminError';
    }
}

/**
 * Constant-time verify of the X-Platform-Admin-Key header.
 *
 * - Returns void on success (call is an assertion, not a lookup).
 * - Throws `PlatformAdminError(503, ...)` when `PLATFORM_ADMIN_API_KEY`
 *   is unset (feature disabled at the operator level).
 * - Throws `PlatformAdminError(401, 'Unauthorized')` on key mismatch or
 *   missing header. The 401 body is deliberately terse — the correct key
 *   is never echoed.
 *
 * Length-mismatch is handled before the `timingSafeEqual` call because
 * `timingSafeEqual` requires equal-length Buffers. An early return on
 * length difference would leak timing information proportional to the
 * key length, so we pad with a dummy comparison instead of returning
 * early.
 */
export function verifyPlatformApiKey(req: NextRequest): void {
    if (!env.PLATFORM_ADMIN_API_KEY) {
        throw new PlatformAdminError(503, 'Platform admin API not configured');
    }

    const provided = req.headers.get(HEADER) ?? '';
    const expected = env.PLATFORM_ADMIN_API_KEY;

    // Constant-time comparison. Buffers must be the same length for
    // timingSafeEqual — we compare against the expected length so an
    // attacker learns nothing from varying the supplied length. If
    // lengths differ, pad/truncate the provided buffer then force a
    // mismatch via a known-bad byte injected at a fixed position.
    const a = Buffer.alloc(expected.length);
    const b = Buffer.from(expected, 'utf8');

    // Write provided bytes — excess bytes are silently truncated by
    // Buffer.write; short writes leave the remainder as 0x00.
    a.write(provided, 'utf8');

    // Force a mismatch when lengths differ so the timingSafeEqual
    // still runs in constant time without giving a length oracle.
    if (provided.length !== expected.length) {
        // Flip the first byte of `a` so equality is impossible even
        // if the prefix matches. XOR with 0xFF is guaranteed to differ
        // from the original for any byte value.
        a[0] = a[0] ^ 0xff;
    }

    if (!timingSafeEqual(a, b)) {
        throw new PlatformAdminError(401, 'Unauthorized');
    }
}
