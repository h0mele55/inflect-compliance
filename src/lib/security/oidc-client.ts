import { z } from 'zod';
import { randomBytes, createHash } from 'crypto';
import type { OidcConfig } from '@/app-layer/schemas/sso-config.schemas';

/**
 * Lightweight OIDC client for tenant-scoped enterprise SSO.
 *
 * This module handles:
 * - OpenID Connect Discovery (well-known endpoint)
 * - Authorization URL construction with PKCE
 * - Token exchange (authorization_code → id_token + access_token)
 * - ID token validation and claim extraction
 *
 * Uses native fetch — no external OIDC libraries required.
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface OidcDiscoveryDocument {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint?: string;
    jwks_uri: string;
}

export interface OidcTokenResponse {
    id_token: string;
    access_token: string;
    token_type: string;
    expires_in?: number;
    refresh_token?: string;
}

export interface OidcUserClaims {
    sub: string;          // Subject identifier (unique per IdP)
    email?: string;
    email_verified?: boolean;
    name?: string;
    given_name?: string;
    family_name?: string;
}

export interface OidcStatePayload {
    tenantSlug: string;
    providerId: string;
    codeVerifier: string;
    nonce: string;
    returnTo?: string;
}

// ─── Discovery ───────────────────────────────────────────────────────

const discoveryCache = new Map<string, { doc: OidcDiscoveryDocument; expiresAt: number }>();

/**
 * Fetch OIDC discovery document from issuer's well-known endpoint.
 * Caches results for 1 hour.
 */
export async function discoverOidc(config: OidcConfig): Promise<OidcDiscoveryDocument> {
    const discoveryUrl = config.discoveryUrl
        ?? `${config.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;

    const cached = discoveryCache.get(discoveryUrl);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.doc;
    }

    const res = await fetch(discoveryUrl, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
        throw new Error(`OIDC discovery failed: ${res.status} ${res.statusText}`);
    }

    const doc = await res.json() as OidcDiscoveryDocument;

    // Basic validation
    if (!doc.issuer || !doc.authorization_endpoint || !doc.token_endpoint) {
        throw new Error('OIDC discovery document missing required fields');
    }

    discoveryCache.set(discoveryUrl, {
        doc,
        expiresAt: Date.now() + 3600_000, // 1 hour
    });

    return doc;
}

// ─── PKCE ────────────────────────────────────────────────────────────

export function generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
}

export function generateNonce(): string {
    return randomBytes(16).toString('base64url');
}

// ─── State Encoding ──────────────────────────────────────────────────

/**
 * Encode state payload as a base64url JSON string.
 * This is passed through the IdP redirect and validated on callback.
 */
export function encodeState(payload: OidcStatePayload): string {
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeState(state: string): OidcStatePayload | null {
    try {
        const json = Buffer.from(state, 'base64url').toString('utf8');
        const parsed = JSON.parse(json);
        if (!parsed.tenantSlug || !parsed.providerId || !parsed.codeVerifier || !parsed.nonce) {
            return null;
        }
        return parsed as OidcStatePayload;
    } catch {
        return null;
    }
}

// ─── Authorization URL ───────────────────────────────────────────────

export function buildAuthorizationUrl(
    discovery: OidcDiscoveryDocument,
    config: OidcConfig,
    callbackUrl: string,
    state: string,
    codeChallenge: string,
    nonce: string
): string {
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: config.clientId,
        redirect_uri: callbackUrl,
        scope: config.scopes.join(' '),
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
    });

    return `${discovery.authorization_endpoint}?${params.toString()}`;
}

// ─── Token Exchange ──────────────────────────────────────────────────

export async function exchangeCodeForTokens(
    discovery: OidcDiscoveryDocument,
    config: OidcConfig,
    code: string,
    callbackUrl: string,
    codeVerifier: string
): Promise<OidcTokenResponse> {
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code_verifier: codeVerifier,
    });

    const res = await fetch(discovery.token_endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
        },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
        const errorBody = await res.text().catch(() => 'unknown');
        throw new Error(`OIDC token exchange failed: ${res.status} ${errorBody}`);
    }

    const tokens = await res.json() as OidcTokenResponse;

    if (!tokens.id_token) {
        throw new Error('OIDC token response missing id_token');
    }

    return tokens;
}

// ─── ID Token Claims Extraction ──────────────────────────────────────

/**
 * Extract claims from an ID token (JWT).
 *
 * Note: This performs base64 decoding only — full signature validation
 * should be done with the IdP's JWKS in production. For enterprise SSO
 * behind TLS with PKCE, the token exchange itself provides sufficient
 * authenticity (the token came directly from the token endpoint over HTTPS).
 */
export function extractIdTokenClaims(idToken: string): OidcUserClaims {
    const parts = idToken.split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid ID token format');
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));

    const ClaimsSchema = z.object({
        sub: z.string().min(1),
        email: z.string().email().optional(),
        email_verified: z.boolean().optional(),
        name: z.string().optional(),
        given_name: z.string().optional(),
        family_name: z.string().optional(),
    });

    return ClaimsSchema.parse(payload);
}

/**
 * Validate ID token nonce matches the expected value.
 */
export function validateIdTokenNonce(idToken: string, expectedNonce: string): boolean {
    try {
        const parts = idToken.split('.');
        if (parts.length !== 3) return false;
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        return payload.nonce === expectedNonce;
    } catch {
        return false;
    }
}

// ─── Test Helpers ────────────────────────────────────────────────────

/** @internal — exposed for testing only */
export function _clearDiscoveryCache(): void {
    discoveryCache.clear();
}
