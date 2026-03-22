import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { OidcConfigSchema } from '@/app-layer/schemas/sso-config.schemas';
import {
    discoverOidc,
    generateCodeVerifier,
    generateCodeChallenge,
    generateNonce,
    encodeState,
    buildAuthorizationUrl,
} from '@/lib/security/oidc-client';
import { ssoLog, generateSsoRequestId, redactSsoUrl } from '@/lib/security/sso-logging';
import { env } from '@/env';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/sso/oidc/start?tenant=<tenantSlug>&provider=<providerId>&returnTo=<path>
 *
 * Initiates the OIDC authorization flow for a tenant-scoped IdP.
 */
export async function GET(req: NextRequest) {
    const requestId = generateSsoRequestId();
    const { searchParams } = req.nextUrl;
    const tenantSlug = searchParams.get('tenant');
    const providerId = searchParams.get('provider');
    const returnTo = searchParams.get('returnTo') || '/';

    // ── Validate params ──
    if (!tenantSlug || !providerId) {
        ssoLog('warn', 'Missing required parameters', {
            requestId, stage: 'start', providerType: 'OIDC',
        });
        return NextResponse.json(
            { error: 'Missing required parameters: tenant and provider' },
            { status: 400 }
        );
    }

    const logCtx = { requestId, tenantSlug, providerType: 'OIDC' as const, providerId };

    ssoLog('info', 'OIDC flow started', { ...logCtx, stage: 'start' });

    // ── Resolve tenant ──
    const tenant = await prisma.tenant.findUnique({
        where: { slug: tenantSlug },
        select: { id: true, slug: true },
    });

    if (!tenant) {
        ssoLog('warn', 'Tenant not found', { ...logCtx, stage: 'start' });
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // ── Load provider config ──
    const provider = await prisma.tenantIdentityProvider.findFirst({
        where: {
            id: providerId,
            tenantId: tenant.id,
            isEnabled: true,
            type: 'OIDC',
        },
    });

    if (!provider) {
        ssoLog('warn', 'Provider not found or disabled', { ...logCtx, stage: 'config_load' });
        return NextResponse.json(
            { error: 'OIDC provider not found or not enabled' },
            { status: 404 }
        );
    }

    // ── Parse OIDC config ──
    const configResult = OidcConfigSchema.safeParse(provider.configJson);
    if (!configResult.success) {
        ssoLog('error', 'Invalid OIDC configuration', {
            ...logCtx, stage: 'config_load',
            meta: { validationError: configResult.error.message },
        });
        return NextResponse.json(
            { error: 'SSO configuration error' },
            { status: 500 }
        );
    }
    const oidcConfig = configResult.data;

    // ── OIDC Discovery ──
    let discovery;
    try {
        discovery = await discoverOidc(oidcConfig);
        ssoLog('info', 'OIDC discovery successful', { ...logCtx, stage: 'discovery' });
    } catch (err) {
        ssoLog('error', 'OIDC discovery failed', {
            ...logCtx, stage: 'discovery',
            meta: { error: (err as Error).message },
        });
        return NextResponse.json(
            { error: 'Failed to contact identity provider' },
            { status: 502 }
        );
    }

    // ── Generate PKCE + state ──
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const nonce = generateNonce();

    const state = encodeState({
        tenantSlug: tenant.slug,
        providerId: provider.id,
        codeVerifier,
        nonce,
        returnTo,
    });

    // ── Build callback URL ──
    const baseUrl = env.APP_URL || req.nextUrl.origin;
    const callbackUrl = `${baseUrl}/api/auth/sso/oidc/callback`;

    // ── Redirect to IdP ──
    const authUrl = buildAuthorizationUrl(
        discovery,
        oidcConfig,
        callbackUrl,
        state,
        codeChallenge,
        nonce
    );

    ssoLog('info', 'Redirecting to IdP', {
        ...logCtx, stage: 'redirect',
        meta: { authUrl: redactSsoUrl(authUrl) },
    });

    return NextResponse.redirect(authUrl);
}
