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
import { env } from '@/env';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/sso/oidc/start?tenant=<tenantSlug>&provider=<providerId>&returnTo=<path>
 *
 * Initiates the OIDC authorization flow for a tenant-scoped IdP:
 * 1. Resolves tenant by slug
 * 2. Loads the enabled OIDC provider config
 * 3. Generates PKCE + nonce + state
 * 4. Redirects to the IdP's authorization endpoint
 */
export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const tenantSlug = searchParams.get('tenant');
    const providerId = searchParams.get('provider');
    const returnTo = searchParams.get('returnTo') || '/';

    // ── Validate params ──
    if (!tenantSlug || !providerId) {
        return NextResponse.json(
            { error: 'Missing required parameters: tenant and provider' },
            { status: 400 }
        );
    }

    // ── Resolve tenant ──
    const tenant = await prisma.tenant.findUnique({
        where: { slug: tenantSlug },
        select: { id: true, slug: true },
    });

    if (!tenant) {
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
        return NextResponse.json(
            { error: 'OIDC provider not found or not enabled' },
            { status: 404 }
        );
    }

    // ── Parse OIDC config ──
    const configResult = OidcConfigSchema.safeParse(provider.configJson);
    if (!configResult.success) {
        console.error('[SSO] Invalid OIDC config for provider:', provider.id, configResult.error.message);
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
    } catch (err) {
        console.error('[SSO] OIDC discovery failed:', (err as Error).message);
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

    return NextResponse.redirect(authUrl);
}
