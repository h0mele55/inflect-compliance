import type { NextRequest } from 'next/server';
import { handlers } from '@/auth';
import {
    enforceRateLimit,
    isRateLimitBypassed,
    LOGIN_LIMIT,
} from '@/lib/security/rate-limit-middleware';

/** NextAuth handlers are request-dependent — never statically generate. */
export const dynamic = 'force-dynamic';

// GET is for CSRF tokens, provider list, and session reads — not a
// brute-forceable surface, so we leave it untouched.
export const { GET } = handlers;

/**
 * POST carries every sign-in / sign-out / callback flow. This is the
 * primary online-brute-force surface for credentials login.
 *
 * We apply LOGIN_LIMIT (10 attempts / 15 min, 15 min lockout) BEFORE
 * delegating to NextAuth. Keying is IP-only here because:
 *   - On credentials sign-in, NextAuth reads the username from the
 *     request body, but we don't parse the body at the rate-limit
 *     layer (body consumption would break NextAuth's own parser).
 *   - IP-only means a single IP credential-spraying many usernames
 *     still gets rate-limited — which is the primary threat.
 *
 * The edge-runtime `authRateLimit` path in src/middleware.ts provides
 * a coarser pre-auth gate; this Node-runtime check is the second
 * layer and the one that actually shares the in-memory counter with
 * the rest of the rate-limited API surface.
 */
export async function POST(req: NextRequest) {
    if (!isRateLimitBypassed()) {
        const { response } = enforceRateLimit(req, {
            scope: 'login',
            config: LOGIN_LIMIT,
        });
        if (response) return response;
    }

    return handlers.POST(req);
}
