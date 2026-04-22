/**
 * GET /api/auth/verify-email?token=<raw>
 *
 * Consumes a one-time email verification token issued by
 * `issueEmailVerification` and redirects to the login page with a
 * status flag the UI can read to show a success / failure banner.
 *
 * GET is appropriate here — the token itself is the authentication
 * for the action (single-use, 256-bit entropy, 24h TTL), which is the
 * standard pattern for email-click verification links. Replay is
 * already prevented by `consumeEmailVerification`: the DB row is
 * deleted inside the same transaction that flips `User.emailVerified`.
 *
 * The response is always a 302 redirect; the query-string flag is the
 * only channel by which the client learns the outcome. An attacker
 * spraying random tokens can tell apart "invalid", "expired", and
 * "success" from the redirect target, but this isn't a meaningful
 * enumeration vector (256-bit tokens are unguessable).
 */

import { NextResponse, type NextRequest } from 'next/server';

import { env } from '@/env';
import { consumeEmailVerification } from '@/lib/auth/email-verification';

function redirectTo(status: 'verified' | 'invalid' | 'expired'): NextResponse {
    const base = env.APP_URL ?? '';
    const target = `${base}/login?verifyStatus=${status}`;
    return NextResponse.redirect(target, { status: 302 });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
    const token = req.nextUrl.searchParams.get('token') ?? '';
    if (!token) return redirectTo('invalid');

    const result = await consumeEmailVerification(token);
    if (result.ok) return redirectTo('verified');
    return redirectTo(result.reason === 'expired' ? 'expired' : 'invalid');
}
