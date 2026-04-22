/**
 * POST /api/auth/register  body: { action: 'register', email, password, name, orgName }
 *
 * Register is the ONLY credentials flow still served by this route.
 * Login was served here historically via `action: 'login'` before the
 * NextAuth Credentials provider became production-grade; that path was
 * removed on 2026-04-22 to avoid having two concurrent login surfaces
 * with subtly different rate-limit / audit / email-verification
 * semantics. All production login now flows through NextAuth
 * `/api/auth/callback/credentials`.
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { signToken } from '@/lib/auth';
import { issueEmailVerification } from '@/lib/auth/email-verification';
import { hashPassword, validatePasswordPolicy } from '@/lib/auth/passwords';
import { withValidatedBody } from '@/lib/validation/route';
import { AuthActionSchema } from '@/lib/schemas';
import { env } from '@/env';
import { withApiErrorHandling } from '@/lib/errors/api';
import { logger } from '@/lib/observability/logger';

export const POST = withApiErrorHandling(withValidatedBody(AuthActionSchema, async (_req, _ctx, body) => {
    try {
        // Zod discriminated-union already rejects anything but `register`
        // — no else branches needed. Keep the try/catch as a final safety
        // net so a DB error during registration returns JSON instead of
        // bubbling as an HTML 500 page.
        return await handleRegister(body);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        logger.error('Auth error', { component: 'auth', error: error instanceof Error ? error.message : String(error) });
        return NextResponse.json<any>({ error: error.message || 'Auth failed' }, { status: 500 });
    }
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRegister(body: any) {
    const { email: rawEmail, password, name, orgName } = body;
    if (!rawEmail || !password || !name || !orgName) {
        return NextResponse.json<any>({ error: 'Missing required fields' }, { status: 400 });
    }

    // Enforce password policy at the set-password boundary. Login
    // does NOT re-validate (see src/lib/auth/passwords.ts) so pre-policy
    // users aren't locked out by a later rule bump.
    const policy = validatePasswordPolicy(password);
    if (!policy.ok) {
        return NextResponse.json<any>(
            {
                error:
                    policy.reason === 'too_short'
                        ? 'Password must be at least 8 characters'
                        : policy.reason === 'too_long'
                          ? 'Password is too long'
                          : 'Password is required',
            },
            { status: 400 },
        );
    }

    const email = String(rawEmail).trim().toLowerCase();

    // Check if email already used
    const existing = await prisma.user.findFirst({ where: { email } });
    if (existing) {
        return NextResponse.json<any>({ error: 'Email already registered' }, { status: 409 });
    }

    // Create tenant
    const slug = String(orgName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);
    const tenant = await prisma.tenant.create({
        data: { name: orgName, slug },
    });

    // Create user (no role/tenantId — membership is sole authority)
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
        data: {
            email,
            passwordHash,
            name,
        },
    });

    // Create TenantMembership (sole source of role + tenant binding)
    const membership = await prisma.tenantMembership.create({
        data: {
            tenantId: tenant.id,
            userId: user.id,
            role: 'ADMIN',
        },
    });

    // Fire the verification email. Non-blocking in intent — the issue
    // path writes the token row in a transaction and then attempts to
    // send the email; mailer failures are swallowed inside
    // issueEmailVerification so the register response is not held up
    // by SMTP latency or outages.
    await issueEmailVerification(email, { userId: user.id }).catch(() => undefined);

    const token = signToken({
        userId: user.id,
        tenantId: tenant.id,
        email: user.email,
        role: membership.role,
    });

    const response = NextResponse.json<any>({
        user: { id: user.id, email: user.email, name: user.name, role: membership.role },
        tenant: { id: tenant.id, name: tenant.name },
        emailVerificationRequired: env.AUTH_REQUIRE_EMAIL_VERIFICATION === '1',
    });

    response.cookies.set('token', token, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
    });

    return response;
}
