import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { OidcConfigSchema } from '@/app-layer/schemas/sso-config.schemas';
import {
    discoverOidc,
    decodeState,
    exchangeCodeForTokens,
    extractIdTokenClaims,
    validateIdTokenNonce,
} from '@/lib/security/oidc-client';
import { linkExternalIdentity } from '@/app-layer/usecases/sso';
import { env } from '@/env';
import jwt from 'jsonwebtoken';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/sso/oidc/callback?code=<code>&state=<state>
 *
 * Handles the OIDC callback after IdP authentication:
 * 1. Validates state (tenant + provider + PKCE verifier)
 * 2. Exchanges authorization code for tokens
 * 3. Extracts and validates ID token claims
 * 4. Links external identity to local user (via usecase)
 * 5. Creates JWT session compatible with existing auth model
 * 6. Redirects to app
 */
export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const code = searchParams.get('code');
    const stateParam = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // ── Handle IdP errors ──
    if (error) {
        console.warn('[SSO] IdP returned error:', error, errorDescription);
        return redirectToLogin(req, 'sso_error', 'Identity provider returned an error');
    }

    if (!code || !stateParam) {
        return redirectToLogin(req, 'missing_params', 'Missing code or state');
    }

    // ── Decode and validate state ──
    const state = decodeState(stateParam);
    if (!state) {
        return redirectToLogin(req, 'invalid_state', 'Invalid SSO state');
    }

    // ── Resolve tenant ──
    const tenant = await prisma.tenant.findUnique({
        where: { slug: state.tenantSlug },
        select: { id: true, slug: true },
    });

    if (!tenant) {
        return redirectToLogin(req, 'tenant_not_found');
    }

    // ── Load provider config (verify it's still enabled) ──
    const provider = await prisma.tenantIdentityProvider.findFirst({
        where: {
            id: state.providerId,
            tenantId: tenant.id,
            isEnabled: true,
            type: 'OIDC',
        },
    });

    if (!provider) {
        return redirectToLogin(req, 'provider_disabled', 'SSO provider is no longer active');
    }

    // ── Parse OIDC config ──
    const configResult = OidcConfigSchema.safeParse(provider.configJson);
    if (!configResult.success) {
        console.error('[SSO] Invalid OIDC config on callback:', provider.id);
        return redirectToLogin(req, 'config_error');
    }
    const oidcConfig = configResult.data;

    // ── OIDC Discovery ──
    let discovery;
    try {
        discovery = await discoverOidc(oidcConfig);
    } catch (err) {
        console.error('[SSO] Discovery failed on callback:', (err as Error).message);
        return redirectToLogin(req, 'discovery_error');
    }

    // ── Exchange code for tokens ──
    const baseUrl = env.APP_URL || req.nextUrl.origin;
    const callbackUrl = `${baseUrl}/api/auth/sso/oidc/callback`;

    let tokens;
    try {
        tokens = await exchangeCodeForTokens(
            discovery,
            oidcConfig,
            code,
            callbackUrl,
            state.codeVerifier
        );
    } catch (err) {
        console.error('[SSO] Token exchange failed:', (err as Error).message);
        return redirectToLogin(req, 'token_error', 'Failed to exchange authorization code');
    }

    // ── Validate nonce ──
    if (!validateIdTokenNonce(tokens.id_token, state.nonce)) {
        console.error('[SSO] Nonce mismatch — possible replay attack');
        return redirectToLogin(req, 'nonce_mismatch');
    }

    // ── Extract claims ──
    let claims;
    try {
        claims = extractIdTokenClaims(tokens.id_token);
    } catch (err) {
        console.error('[SSO] Failed to extract ID token claims:', (err as Error).message);
        return redirectToLogin(req, 'claims_error');
    }

    if (!claims.email) {
        return redirectToLogin(req, 'no_email', 'Identity provider did not return an email');
    }

    // ── Link external identity to local user ──
    const linkResult = await linkExternalIdentity(
        tenant.id,
        provider.id,
        claims.sub,
        claims.email
    );

    if (linkResult.status === 'rejected') {
        const reasonMessages: Record<string, string> = {
            cross_tenant: 'Cross-tenant login attempt blocked',
            domain_mismatch: 'Email domain not allowed for this SSO provider',
            no_user: 'No matching account found. Contact your administrator.',
            no_membership: 'No matching account found. Contact your administrator.',
            subject_conflict: 'Identity conflict detected. Contact your administrator.',
            jit_disabled: 'No matching account found. Contact your administrator.',
            no_email: 'Identity provider did not return an email',
        };
        console.warn('[SSO] Identity linking rejected', {
            tenantId: tenant.id,
            providerId: provider.id,
            email: claims.email,
            sub: claims.sub,
            reason: linkResult.reason,
        });
        return redirectToLogin(
            req,
            linkResult.reason,
            reasonMessages[linkResult.reason] || 'Login failed'
        );
    }

    const linkedUserId = linkResult.userId;

    // ── Load user and membership for session ──
    const membership = await prisma.tenantMembership.findUnique({
        where: {
            tenantId_userId: {
                tenantId: tenant.id,
                userId: linkedUserId,
            },
        },
    });

    if (!membership) {
        return redirectToLogin(req, 'no_membership');
    }

    const user = await prisma.user.findUnique({
        where: { id: linkedUserId },
        select: { id: true, email: true, name: true },
    });

    if (!user) {
        return redirectToLogin(req, 'user_not_found');
    }

    // ── Create JWT session (compatible with Auth.js JWT strategy) ──
    const authSecret = env.AUTH_SECRET;
    if (!authSecret) {
        console.error('[SSO] AUTH_SECRET not set — cannot create session');
        return redirectToLogin(req, 'config_error');
    }

    const sessionToken = jwt.sign(
        {
            userId: user.id,
            email: user.email,
            name: user.name,
            tenantId: tenant.id,
            role: membership.role,
            provider: `sso-oidc-${provider.id}`,
            sub: user.id,
            iat: Math.floor(Date.now() / 1000),
        },
        authSecret,
        { expiresIn: '7d' }
    );

    // ── Set session cookie (matching Auth.js cookie name) ──
    const isProduction = env.NODE_ENV === 'production';
    const cookieName = isProduction
        ? '__Secure-authjs.session-token'
        : 'authjs.session-token';

    const cookieStore = await cookies();
    cookieStore.set(cookieName, sessionToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    // ── Redirect to app ──
    const returnTo = state.returnTo || `/t/${tenant.slug}/dashboard`;
    return NextResponse.redirect(new URL(returnTo, baseUrl));
}

// ─── Helpers ─────────────────────────────────────────────────────────

function redirectToLogin(
    req: NextRequest,
    errorCode: string,
    errorMessage?: string
): NextResponse {
    const loginUrl = new URL('/login', req.nextUrl.origin);
    loginUrl.searchParams.set('error', errorCode);
    if (errorMessage) {
        loginUrl.searchParams.set('error_description', errorMessage);
    }
    return NextResponse.redirect(loginUrl);
}
