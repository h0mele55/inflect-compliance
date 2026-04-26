/**
 * GAP-06 — password lifecycle usecases.
 *
 * Three flows, each thin enough to fit on screen:
 *
 *   - {@link requestPasswordReset}: forgot-password initiation.
 *     ALWAYS resolves to the same opaque "ok" — caller serves a uniform
 *     200. Handles the user-not-found branch with a timing burn so an
 *     observer cannot enumerate emails via response latency.
 *
 *   - {@link consumePasswordReset}: token-bound password reset.
 *     Validates new password, applies HIBP, atomically claims the token,
 *     writes the new hash, bumps sessionVersion (kills every active JWT),
 *     emits audit. Returns a typed result the route translates to HTTP.
 *
 *   - {@link changeAuthenticatedPassword}: in-product password change.
 *     Requires session, verifies current password (with progressive
 *     lockout on failure to mirror login), applies HIBP on the new
 *     password, writes the new hash, bumps sessionVersion + revokes
 *     OTHER sessions while preserving the current device.
 *
 * Every set-password operation runs through the same primitives:
 *   - validatePasswordPolicy (length floor/ceiling)
 *   - checkPasswordAgainstHIBP (breach screen, fail-open on outage)
 *   - hashPassword (bcrypt cost 12)
 *   - sessionVersion bump (Epic C.3 logout-everywhere)
 *
 * Audit events:
 *   AUTH_PASSWORD_RESET_REQUESTED / _UNKNOWN_TARGET / _COMPLETED / _FAILED
 *   AUTH_PASSWORD_CHANGED / _CHANGE_FAILED
 */

import prisma from '@/lib/prisma';
import {
    hashPassword,
    validatePasswordPolicy,
    verifyPassword,
    dummyVerify,
} from '@/lib/auth/passwords';
import { checkPasswordAgainstHIBP } from '@/lib/security/password-check';
import {
    issuePasswordResetToken,
    consumePasswordResetToken,
    invalidateUserPasswordResetTokens,
    PASSWORD_RESET_TOKEN_TTL_MS,
} from '@/lib/auth/password-reset-tokens';
import { sendPasswordResetEmail } from '@/lib/auth/password-reset-email';
import {
    recordPasswordResetRequested,
    recordPasswordResetRequestedUnknownTarget,
    recordPasswordResetCompleted,
    recordPasswordResetFailed,
    recordPasswordChanged,
    recordPasswordChangeFailed,
} from '@/lib/auth/security-events';
import { revokeOtherUserSessions } from '@/app-layer/usecases/session-security';
import {
    evaluateProgressiveRateLimit,
    recordProgressiveFailure,
    resetProgressiveFailures,
    LOGIN_PROGRESSIVE_POLICY,
} from '@/lib/security/rate-limit';
import { env } from '@/env';
import type { RequestContext } from '@/app-layer/types';
import { logger } from '@/lib/observability/logger';

// ── Anti-enumeration helpers ───────────────────────────────────────────

/**
 * Minimum wall-clock duration of the forgot-password request, irrespective
 * of branch. Calibrated to cover the slowest realistic real-user branch
 * (DB write + SMTP dispatch) so the response time is dominated by the
 * floor, not by which branch executed. Below this floor an attacker
 * could distinguish branches via response latency.
 *
 * 800ms is comfortably above SMTP send latency in our prod transport
 * (~150–400ms) and a deleteMany+create transaction (~10–30ms). Tested
 * for cross-branch convergence in `password-anti-enumeration.test.ts`.
 */
const FORGOT_PASSWORD_MIN_DURATION_MS = 800;

async function sleep(ms: number): Promise<void> {
    if (ms <= 0) return;
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Pads the request to a uniform floor regardless of which forgot-password
 * branch executed. Subtle: works on `Date.now()` deltas so a fast machine
 * and a slow machine both converge, with floor as the lower bound.
 */
async function padToFloor(startedAt: number): Promise<void> {
    const elapsed = Date.now() - startedAt;
    await sleep(FORGOT_PASSWORD_MIN_DURATION_MS - elapsed);
}

// ── Forgot password ────────────────────────────────────────────────────

export interface RequestPasswordResetInput {
    email: string;
    /** Optional — included in audit + token row for forensics. */
    requestIp?: string | null;
    /** Correlation id for log linking. */
    requestId?: string;
}

/**
 * Initiate a password reset. ALWAYS returns void; the route emits a
 * uniform 200 regardless of whether the email mapped to a real user.
 *
 * Three branches, all visibly identical to the caller:
 *
 *   1. Email maps to a User with passwordHash → mint reset token,
 *      send email, audit AUTH_PASSWORD_RESET_REQUESTED.
 *   2. Email maps to a User without passwordHash (OAuth-only) → no
 *      token, no email, audit (logger-only) AUTH_PASSWORD_RESET_..._UNKNOWN_TARGET.
 *   3. Email does not exist → no token, no email, audit (logger-only).
 *
 * In branches (2) and (3) we run a dummy bcrypt op to mirror the CPU
 * cost the real branch incurs hashing the new password later. We
 * additionally pad the wall-clock duration to a uniform floor.
 */
export async function requestPasswordReset(
    input: RequestPasswordResetInput,
): Promise<void> {
    const startedAt = Date.now();
    const email = (input.email ?? '').trim().toLowerCase();

    if (!email) {
        // Schema layer should have rejected; defence-in-depth + match
        // floor timing.
        await padToFloor(startedAt);
        return;
    }

    let user: { id: string; email: string; passwordHash: string | null } | null = null;
    try {
        user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true, passwordHash: true },
        });
    } catch (err) {
        // DB error — log, fall through to fake-branch timing so the API
        // shape stays uniform.
        logger.warn('forgot-password user lookup failed', {
            component: 'auth',
            error: err instanceof Error ? err.message : String(err),
        });
    }

    if (!user || !user.passwordHash) {
        // Unknown / OAuth-only target. Burn dummy CPU and pad to floor.
        await dummyVerify('not-a-real-password-equalisation');
        await recordPasswordResetRequestedUnknownTarget({
            email,
            requestId: input.requestId,
        });
        await padToFloor(startedAt);
        return;
    }

    // Real path — mint token, dispatch email, audit. Failures inside any
    // of these MUST NOT propagate as 5xx (would leak branch via status
    // code). Token-issuance failure is the only one we treat as fatal
    // because without a token the email is meaningless; we still pad.
    try {
        const { rawToken } = await issuePasswordResetToken({
            userId: user.id,
            requestIp: input.requestIp ?? null,
        });
        await sendPasswordResetEmail({ email: user.email, rawToken });
        await recordPasswordResetRequested({
            userId: user.id,
            email: user.email,
            requestId: input.requestId,
        });
    } catch (err) {
        logger.warn('forgot-password issue/send failed', {
            component: 'auth',
            userId: user.id,
            error: err instanceof Error ? err.message : String(err),
        });
    }

    await padToFloor(startedAt);
}

// ── Reset password (token-bound) ───────────────────────────────────────

export type ConsumePasswordResetResult =
    | { ok: true; userId: string }
    | { ok: false; status: 400; reason: 'breached_password' | 'policy_rejected'; message: string }
    | { ok: false; status: 410; reason: 'invalid_token' | 'expired_token' | 'used_token'; message: string };

export interface ConsumePasswordResetInput {
    token: string;
    newPassword: string;
    requestId?: string;
}

/**
 * Consume a reset token and set a new password.
 *
 * Order of operations is deliberate: HIBP/policy first, atomic-claim
 * second. If we claimed first then HIBP-rejected, we'd burn the token
 * and force the user to start over for a fixable input error. Doing
 * HIBP first means a breached-password choice can be retried with the
 * same link.
 *
 * Side effects on success:
 *   - Update User.passwordHash + passwordChangedAt
 *   - Bump User.sessionVersion (force-revoke every existing JWT)
 *   - Delete every other reset token for this user
 *   - Mark UserSession rows revoked with reason 'password-reset'
 *   - Emit AUTH_PASSWORD_RESET_COMPLETED audit
 */
export async function consumePasswordReset(
    input: ConsumePasswordResetInput,
): Promise<ConsumePasswordResetResult> {
    // ── Validate new password BEFORE consuming the token. ──
    const policy = validatePasswordPolicy(input.newPassword);
    if (!policy.ok) {
        await recordPasswordResetFailed({
            userId: null,
            email: null,
            reason: 'policy_rejected',
            requestId: input.requestId,
        });
        return {
            ok: false,
            status: 400,
            reason: 'policy_rejected',
            message:
                policy.reason === 'too_short'
                    ? 'Password must be at least 8 characters'
                    : policy.reason === 'too_long'
                      ? 'Password is too long'
                      : 'Password is required',
        };
    }

    const hibp = await checkPasswordAgainstHIBP(input.newPassword);
    if (hibp.breached) {
        await recordPasswordResetFailed({
            userId: null,
            email: null,
            reason: 'breached_password',
            requestId: input.requestId,
        });
        return {
            ok: false,
            status: 400,
            reason: 'breached_password',
            message:
                'This password appears in known data breaches. Please choose a different password.',
        };
    }

    // ── Atomic claim. ──
    const claim = await consumePasswordResetToken(input.token);
    if (!claim.ok) {
        await recordPasswordResetFailed({
            userId: null,
            email: null,
            reason:
                claim.reason === 'invalid'
                    ? 'invalid_token'
                    : claim.reason === 'expired'
                      ? 'expired_token'
                      : 'used_token',
            requestId: input.requestId,
        });
        return {
            ok: false,
            status: 410,
            reason:
                claim.reason === 'invalid'
                    ? 'invalid_token'
                    : claim.reason === 'expired'
                      ? 'expired_token'
                      : 'used_token',
            message: 'This reset link is no longer valid. Please request a new one.',
        };
    }

    // Resolve email for audit attribution. The User must still exist —
    // onDelete: Cascade on PasswordResetToken would have removed the
    // row if the User were gone, so a not-found here is a real anomaly.
    const user = await prisma.user.findUnique({
        where: { id: claim.userId },
        select: { id: true, email: true },
    });
    if (!user) {
        // Token resolved to a vanished user. Treat as invalid (no row to
        // update); audit logger-only.
        await recordPasswordResetFailed({
            userId: claim.userId,
            email: null,
            reason: 'invalid_token',
            requestId: input.requestId,
        });
        return {
            ok: false,
            status: 410,
            reason: 'invalid_token',
            message: 'This reset link is no longer valid. Please request a new one.',
        };
    }

    const newHash = await hashPassword(input.newPassword);

    await prisma.$transaction([
        prisma.user.update({
            where: { id: user.id },
            data: {
                passwordHash: newHash,
                passwordChangedAt: new Date(),
                sessionVersion: { increment: 1 },
            },
        }),
        prisma.passwordResetToken.deleteMany({
            where: { userId: user.id },
        }),
        prisma.userSession.updateMany({
            where: { userId: user.id, revokedAt: null },
            data: {
                revokedAt: new Date(),
                revokedReason: 'password-reset',
            },
        }),
    ]);

    await recordPasswordResetCompleted({
        userId: user.id,
        email: user.email,
        requestId: input.requestId,
    });

    return { ok: true, userId: user.id };
}

// ── Change password (authenticated) ────────────────────────────────────

export type ChangePasswordResult =
    | { ok: true }
    | { ok: false; status: 400; reason: 'wrong_current' | 'breached_password' | 'policy_rejected' | 'oauth_only' | 'same_password'; message: string }
    | { ok: false; status: 429; reason: 'rate_limited'; retryAfterSeconds: number; message: string };

export interface ChangeAuthenticatedPasswordInput {
    currentPassword: string;
    newPassword: string;
    /** UserSession.id from the JWT — kept active across the change. */
    currentUserSessionId: string | null;
    requestId?: string;
}

/**
 * Change the authenticated user's password.
 *
 * Wrong-current path mirrors the login attempt machinery: progressive
 * delay → lockout. Keyed by `change-pw:${userId}` so it doesn't share a
 * counter with the login limiter.
 *
 * Bumps sessionVersion + revokes every OTHER UserSession row. The
 * current device's row is preserved so the user stays signed in. The
 * caller is responsible for refreshing the JWT cookie on the response;
 * NextAuth's JWT callback otherwise picks up the new sessionVersion on
 * the next request and forces re-auth.
 */
export async function changeAuthenticatedPassword(
    ctx: RequestContext,
    input: ChangeAuthenticatedPasswordInput,
): Promise<ChangePasswordResult> {
    const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { id: true, email: true, passwordHash: true },
    });
    if (!user) {
        // Should not happen — ctx.userId came from the JWT.
        throw new Error('changeAuthenticatedPassword: ctx user vanished');
    }

    if (!user.passwordHash) {
        await recordPasswordChangeFailed({
            userId: user.id,
            email: user.email,
            tenantId: ctx.tenantId,
            reason: 'oauth_only',
            requestId: input.requestId,
        });
        return {
            ok: false,
            status: 400,
            reason: 'oauth_only',
            message:
                'This account does not have a password — sign in with your identity provider instead.',
        };
    }

    // Progressive lockout for the current-password verification.
    const progressiveKey = `change-pw:${user.id}`;
    const runProgressive =
        env.AUTH_TEST_MODE !== '1' && env.RATE_LIMIT_ENABLED !== '0';
    if (runProgressive) {
        const decision = evaluateProgressiveRateLimit(
            progressiveKey,
            LOGIN_PROGRESSIVE_POLICY,
        );
        if (!decision.allowed) {
            // Burn dummy time so a stopwatch can't tell lockout apart
            // from a real verify.
            await dummyVerify(input.currentPassword);
            return {
                ok: false,
                status: 429,
                reason: 'rate_limited',
                retryAfterSeconds: decision.retryAfterSeconds,
                message: 'Too many attempts. Please try again later.',
            };
        }
        if (decision.delayMs > 0) {
            await sleep(decision.delayMs);
        }
    }

    const currentOk = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!currentOk) {
        if (runProgressive) {
            recordProgressiveFailure(progressiveKey, LOGIN_PROGRESSIVE_POLICY);
        }
        await recordPasswordChangeFailed({
            userId: user.id,
            email: user.email,
            tenantId: ctx.tenantId,
            reason: 'wrong_current',
            requestId: input.requestId,
        });
        return {
            ok: false,
            status: 400,
            reason: 'wrong_current',
            message: 'Current password is incorrect',
        };
    }

    // ── New password validation ──
    const policy = validatePasswordPolicy(input.newPassword);
    if (!policy.ok) {
        await recordPasswordChangeFailed({
            userId: user.id,
            email: user.email,
            tenantId: ctx.tenantId,
            reason: 'policy_rejected',
            requestId: input.requestId,
        });
        return {
            ok: false,
            status: 400,
            reason: 'policy_rejected',
            message:
                policy.reason === 'too_short'
                    ? 'Password must be at least 8 characters'
                    : policy.reason === 'too_long'
                      ? 'Password is too long'
                      : 'Password is required',
        };
    }

    // Reject same-as-current. Doesn't catch every reuse (the user could
    // submit `newPassword === currentPassword` only at this layer; we
    // don't track a history beyond the current hash) but it stops the
    // most common UX accident.
    const sameAsCurrent = await verifyPassword(input.newPassword, user.passwordHash);
    if (sameAsCurrent) {
        await recordPasswordChangeFailed({
            userId: user.id,
            email: user.email,
            tenantId: ctx.tenantId,
            reason: 'policy_rejected',
            requestId: input.requestId,
        });
        return {
            ok: false,
            status: 400,
            reason: 'same_password',
            message: 'New password must be different from the current password.',
        };
    }

    const hibp = await checkPasswordAgainstHIBP(input.newPassword);
    if (hibp.breached) {
        await recordPasswordChangeFailed({
            userId: user.id,
            email: user.email,
            tenantId: ctx.tenantId,
            reason: 'breached_password',
            requestId: input.requestId,
        });
        return {
            ok: false,
            status: 400,
            reason: 'breached_password',
            message:
                'This password appears in known data breaches. Please choose a different password.',
        };
    }

    const newHash = await hashPassword(input.newPassword);

    await prisma.user.update({
        where: { id: user.id },
        data: {
            passwordHash: newHash,
            passwordChangedAt: new Date(),
        },
    });

    // sessionVersion bump + revoke every OTHER UserSession row, keep current.
    await revokeOtherUserSessions(ctx, input.currentUserSessionId ?? null);

    // Burn any outstanding reset tokens — defence-in-depth so a leaked
    // forgot-password link from before the change can't take the
    // account back.
    await invalidateUserPasswordResetTokens(user.id).catch(() => undefined);

    if (runProgressive) {
        resetProgressiveFailures(progressiveKey);
    }

    await recordPasswordChanged({
        userId: user.id,
        email: user.email,
        tenantId: ctx.tenantId,
        requestId: input.requestId,
    });

    return { ok: true };
}

// Re-export for ergonomic access from tests.
export { PASSWORD_RESET_TOKEN_TTL_MS };
