/**
 * Password-reset token primitives — pure DB + crypto helpers.
 *
 * Schema: dedicated `PasswordResetToken` table (NOT VerificationToken,
 * which is reserved for email verification with a longer 24h TTL and
 * different audit semantics). Stores `tokenHash` (sha256 hex of the raw
 * token), `userId`, `expiresAt`, `usedAt` for single-use atomic claim,
 * `requestIp` for forensics, `createdAt`. Raw tokens only ever exist in
 * memory on the issue side and on the consume side.
 *
 * Lifetime: 30 minutes. Account-takeover stakes are higher than email
 * verification (24h), so the window is aggressive — a leaked URL in
 * browser history / proxy logs has bounded blast radius. Longer windows
 * shift risk onto the user; shorter windows hurt UX (slow inbox / first-
 * click bot crawlers consuming the link).
 *
 * Single-use: enforced by the atomic-claim pattern on `usedAt`:
 *
 *   UPDATE ... SET usedAt = NOW()
 *   WHERE tokenHash = ? AND usedAt IS NULL AND expiresAt > NOW()
 *
 * First caller wins; concurrent callers get count=0 and 410. The same
 * pattern is used in `tenant-invites.ts:redeemInvite` for the same
 * concurrency property.
 *
 * Prior-token invalidation: every issuance deletes outstanding tokens
 * for the user. A second forgot-password request silently kills the
 * first link — standard UX, prevents stale-token attack surface.
 *
 * No raw token touches the logger. Caller responsibilities:
 *   - issuePasswordResetToken returns the raw token; route handler emails
 *     it then drops the reference.
 *   - consumePasswordResetToken accepts the raw token from the request
 *     body; hashes it locally; never logs it.
 */

import crypto from 'node:crypto';

import prisma from '@/lib/prisma';

// ── Policy ─────────────────────────────────────────────────────────────

/** 30-minute window from issuance to expiry. */
export const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/** 32 bytes → 64 hex chars; 256 bits of entropy. */
const TOKEN_BYTES = 32;

// ── Token helpers ──────────────────────────────────────────────────────

export function generateRawResetToken(): string {
    return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

export function hashResetToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
}

// ── Issue ──────────────────────────────────────────────────────────────

export interface IssueResetTokenInput {
    userId: string;
    requestIp?: string | null;
}

export interface IssueResetTokenResult {
    /** Raw token — include in the reset email URL, never persist. */
    rawToken: string;
    /** Stored row id — useful for log/audit correlation. */
    tokenId: string;
    /** Same value as policy + Date.now(); returned for caller convenience. */
    expiresAt: Date;
}

/**
 * Mint a fresh reset token for a user. Invalidates any outstanding
 * tokens for the same user in the same transaction so only the latest
 * link is valid.
 */
export async function issuePasswordResetToken(
    input: IssueResetTokenInput,
): Promise<IssueResetTokenResult> {
    const rawToken = generateRawResetToken();
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

    const [, created] = await prisma.$transaction([
        prisma.passwordResetToken.deleteMany({
            where: {
                OR: [
                    { userId: input.userId },
                    { expiresAt: { lt: new Date() } },
                ],
            },
        }),
        prisma.passwordResetToken.create({
            data: {
                userId: input.userId,
                tokenHash,
                expiresAt,
                requestIp: input.requestIp ?? null,
            },
            select: { id: true },
        }),
    ]);

    return { rawToken, tokenId: created.id, expiresAt };
}

// ── Consume ────────────────────────────────────────────────────────────

export type ConsumeResetTokenResult =
    | { ok: true; userId: string }
    | { ok: false; reason: 'invalid' | 'expired' | 'used' };

/**
 * Atomically claim a reset token. Returns the bound userId on success.
 *
 * The atomic-claim shape:
 *   updateMany WHERE tokenHash = ? AND usedAt IS NULL AND expiresAt > NOW()
 *   SET usedAt = NOW()
 *
 * Concurrent calls with the same token resolve to exactly one success
 * (count=1) and N-1 failures (count=0). `tokenHash` is unique, so the
 * lookup is an indexed equality.
 *
 * On failure we do a follow-up read to differentiate `invalid` (no row)
 * from `expired` (row exists, past expiresAt) from `used` (row exists,
 * usedAt set). This is purely for UX clarity — token entropy is 256 bits
 * so the differentiation isn't meaningfully an enumeration vector.
 */
export async function consumePasswordResetToken(
    rawToken: string,
): Promise<ConsumeResetTokenResult> {
    const raw = (rawToken ?? '').trim();
    if (!raw) return { ok: false, reason: 'invalid' };

    const tokenHash = hashResetToken(raw);

    const claim = await prisma.passwordResetToken.updateMany({
        where: {
            tokenHash,
            usedAt: null,
            expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
    });

    if (claim.count === 0) {
        const row = await prisma.passwordResetToken.findUnique({
            where: { tokenHash },
            select: { usedAt: true, expiresAt: true },
        });
        if (!row) return { ok: false, reason: 'invalid' };
        if (row.usedAt) return { ok: false, reason: 'used' };
        return { ok: false, reason: 'expired' };
    }

    const claimed = await prisma.passwordResetToken.findUnique({
        where: { tokenHash },
        select: { userId: true },
    });
    if (!claimed) {
        // Race: someone purged the row between our claim and read. Treat
        // as invalid; the password row was never touched.
        return { ok: false, reason: 'invalid' };
    }

    return { ok: true, userId: claimed.userId };
}

// ── Maintenance ────────────────────────────────────────────────────────

/**
 * Delete every reset token whose `expiresAt` has passed. Idempotent;
 * safe to call on any cadence. The table stays small in practice
 * (bounded by active reset attempts × TTL) so a daily cron is plenty.
 */
export async function pruneExpiredPasswordResetTokens(): Promise<number> {
    const result = await prisma.passwordResetToken.deleteMany({
        where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
}

/**
 * Delete every outstanding reset token for a specific user. Called after
 * a successful password change/reset to invalidate any other links the
 * user may have requested mid-flow (e.g. clicked "forgot" twice, used
 * the second link, the first is still in their inbox).
 */
export async function invalidateUserPasswordResetTokens(
    userId: string,
): Promise<number> {
    const result = await prisma.passwordResetToken.deleteMany({
        where: { userId },
    });
    return result.count;
}
