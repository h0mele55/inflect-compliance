/**
 * Password-reset email builder + dispatcher.
 *
 * Kept separate from the token primitives so tests can mock the mailer
 * boundary cleanly. The route handler never touches `sendEmail` directly.
 */

import { sendEmail } from '@/lib/mailer';
import { env } from '@/env';
import { logger } from '@/lib/observability/logger';
import { hashEmailForLog } from '@/lib/auth/security-events';

export interface PasswordResetEmailInput {
    /** Recipient email — already normalised (trim+lowercase). */
    email: string;
    /** Raw reset token (NOT the hash). Goes into the URL. */
    rawToken: string;
    /** TTL minutes for human-friendly copy. */
    ttlMinutes?: number;
}

/**
 * Build the canonical reset URL. APP_URL is validated in env.ts; falls
 * back to a relative URL for dev environments without the var set.
 */
function buildResetUrl(rawToken: string): string {
    const base = env.APP_URL ?? '';
    return `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

export async function sendPasswordResetEmail(
    input: PasswordResetEmailInput,
): Promise<void> {
    const ttl = input.ttlMinutes ?? 30;
    const resetUrl = buildResetUrl(input.rawToken);

    const subject = 'Reset your Inflect Compliance password';
    const text = [
        'You (or someone with your email) requested a password reset for your Inflect Compliance account.',
        '',
        `Click the link below to choose a new password. The link expires in ${ttl} minutes.`,
        '',
        resetUrl,
        '',
        'If you did not request this, you can safely ignore this message — your password will not change unless you click the link.',
        '',
        'For security, any earlier reset links are now invalid.',
    ].join('\n');

    const html = [
        '<p>You (or someone with your email) requested a password reset for your Inflect Compliance account.</p>',
        `<p>Click the link below to choose a new password. The link expires in ${ttl} minutes.</p>`,
        `<p><a href="${resetUrl}">Reset password</a></p>`,
        '<p>If you did not request this, you can safely ignore this message — your password will not change unless you click the link.</p>',
        '<p style="color:#888;font-size:12px;">For security, any earlier reset links are now invalid.</p>',
    ].join('');

    try {
        await sendEmail({ to: input.email, subject, text, html });
    } catch (err) {
        // Mailer failures must NOT propagate to the route handler — that
        // would let the timing of "real send vs faked send" leak via 500
        // responses. Token is already persisted; operator sees this in
        // mailer logs.
        logger.warn('password-reset email send failed', {
            component: 'auth',
            identifierHash: hashEmailForLog(input.email),
            error: err instanceof Error ? err.message : String(err),
        });
    }
}
