/**
 * Credentials authentication chokepoint.
 *
 * ## Purpose
 * One function ({@link authenticateWithPassword}) owns the entire
 * email+password auth decision, top to bottom. NextAuth's Credentials
 * provider delegates here; the legacy /api/auth/register login handler
 * delegates here; any future server action delegates here. Every
 * password-based login attempt flows through this exact path — which
 * is what makes rate-limiting, audit logging, email-verification
 * enforcement, and lockout trivially bolt-on in later prompts: wrap or
 * augment this one function.
 *
 * ## Layering
 * ```
 *   caller (NextAuth authorize / API route / server action)
 *         └─▶ authenticateWithPassword
 *                 ├─▶ user lookup                  (prisma)
 *                 ├─▶ password verify              (lib/auth/passwords)
 *                 ├─▶ email-verification gate      (optional, see below)
 *                 └─▶ silent rehash-on-verify      (lib/auth/passwords)
 * ```
 * Session issuance (JWT/cookie) is the CALLER's job — NextAuth handles
 * it when invoked via the Credentials provider; the legacy API route
 * calls `signToken` directly. This file stays free of HTTP / session
 * concerns on purpose.
 *
 * ## Error shape (account-enumeration safe)
 * Every *authentication* failure returns
 * `{ ok: false, reason: 'credentials_invalid' }`. We do NOT distinguish
 *   - email not in DB
 *   - email in DB but no `passwordHash` (OAuth-only user)
 *   - email + passwordHash exist but password doesn't match
 * …because doing so lets an attacker enumerate registered emails via
 * the response. Timing is also equalised: the not-found branch runs a
 * dummy bcrypt compare (see {@link dummyVerify}) so wall-clock leakage
 * matches the real-verify branch.
 *
 * `email_not_verified` is intentionally separate — once
 * `AUTH_REQUIRE_EMAIL_VERIFICATION` is turned on in a later prompt,
 * callers may want to tell a legitimate user "check your inbox" rather
 * than showing the generic "bad credentials" message. The default for
 * that flag is OFF so existing behaviour is preserved.
 *
 * ## What does NOT live here
 *   - Rate limiting / lockout / audit emission: wrap the caller, don't
 *     mutate this function. Keeps the contract ("verify these creds,
 *     tell me yes or no") narrow.
 *   - Session / cookie issuance: caller's responsibility.
 *   - Password policy (length / breach list): that gates *setting* a
 *     password, not checking one. See
 *     `validatePasswordPolicy` in `./passwords.ts`.
 */

import prisma from '@/lib/prisma';
import { env } from '@/env';
import {
    dummyVerify,
    hashPassword,
    needsRehash,
    verifyPassword,
} from './passwords';

// ── Public contract ────────────────────────────────────────────────────

export type AuthFailureReason =
    /** Unknown email, no password set, or wrong password — all collapse here. */
    | 'credentials_invalid'
    /** Email-verification is required and the account has not completed it. */
    | 'email_not_verified';

export type AuthResult =
    | {
          ok: true;
          userId: string;
          email: string;
          name: string | null;
      }
    | { ok: false; reason: AuthFailureReason };

export interface AuthenticateInput {
    email: string;
    password: string;
}

// ── Chokepoint ─────────────────────────────────────────────────────────

/**
 * Verify an email+password pair and return an {@link AuthResult}.
 *
 * Contract guarantees:
 *   - Always returns (never throws); caller sees a typed discriminated
 *     union instead of an exception surface.
 *   - Constant-ish time between "user not found" and "password wrong" —
 *     see `dummyVerify`.
 *   - On success, silently re-hashes the password at the current
 *     {@link BCRYPT_COST} if the stored hash is stale. Old users get
 *     migrated in place on their next login — no reset email needed.
 *   - Does NOT issue a session or set cookies. Pure "are these creds
 *     good?" question; the caller wires the session on yes.
 */
export async function authenticateWithPassword(
    input: AuthenticateInput,
): Promise<AuthResult> {
    const email = (input.email ?? '').trim().toLowerCase();
    const password = input.password ?? '';

    // Empty input — fast path that still burns bcrypt time so an attacker
    // can't distinguish empty-input early-return from real verify latency.
    if (!email || !password) {
        await dummyVerify(password);
        return { ok: false, reason: 'credentials_invalid' };
    }

    let user: {
        id: string;
        email: string;
        name: string | null;
        passwordHash: string | null;
        emailVerified: Date | null;
    } | null = null;
    try {
        user = await prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                email: true,
                name: true,
                passwordHash: true,
                emailVerified: true,
            },
        });
    } catch {
        // DB lookup errors are indistinguishable from "user not found" at
        // the API boundary. The caller's observability wrapper will log
        // the real reason if it matters.
        await dummyVerify(password);
        return { ok: false, reason: 'credentials_invalid' };
    }

    if (!user || !user.passwordHash) {
        // Unknown email, or OAuth-only user with no password set. Burn
        // bcrypt time against the dummy hash so the attacker's stopwatch
        // can't tell the difference.
        await dummyVerify(password);
        return { ok: false, reason: 'credentials_invalid' };
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
        return { ok: false, reason: 'credentials_invalid' };
    }

    // ── Post-verify gates ──
    // Email verification: off by default. When the env flag flips on,
    // accounts with a null `emailVerified` can't sign in via credentials —
    // they're funnelled into the verify-your-email flow (later prompt).
    if (env.AUTH_REQUIRE_EMAIL_VERIFICATION === '1' && !user.emailVerified) {
        return { ok: false, reason: 'email_not_verified' };
    }

    // ── Silent rehash-on-verify migration ──
    // If the stored hash is weaker than the current BCRYPT_COST, take
    // the plaintext we already have in hand and store a fresh hash. The
    // next login won't need this path. Errors here MUST NOT fail the
    // login — the user already proved they know the password.
    if (needsRehash(user.passwordHash)) {
        try {
            const newHash = await hashPassword(password);
            await prisma.user.update({
                where: { id: user.id },
                data: { passwordHash: newHash },
            });
        } catch {
            // Swallow — rehash is best-effort housekeeping, not a gate.
        }
    }

    return {
        ok: true,
        userId: user.id,
        email: user.email,
        name: user.name,
    };
}
