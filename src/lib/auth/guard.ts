/**
 * Edge-compatible auth guard helpers.
 * Pure functions — no Node.js or Prisma imports.
 * Used by middleware.ts for path classification and redirect building.
 */
import { NextResponse } from 'next/server';

// ─── Public path allowlist ───

const PUBLIC_PATH_PREFIXES = [
    '/login',
    '/register',
    '/no-tenant',        // Landing page for uninvited users — must not gate-loop
    '/invite/',          // Invite preview page — public so unauthenticated users can see invite details
    '/api/auth',         // Auth.js callbacks, session, csrf, providers
    '/api/invites/',     // Invite redemption API (public) + start-signin cookie setter
    '/api/health',       // Health check (no auth) — deprecated alias
    '/api/livez',        // Liveness probe (no auth)
    '/api/readyz',       // Readiness probe (no auth)
    '/api/staging/seed', // Staging seed endpoint (token-gated internally)
    '/audit/shared',     // Shared audit pack read-only view (token-gated, no login)
    '/api/audit/shared', // Shared audit pack API endpoint (token-gated)
    '/_next',            // Next.js internals
];

const PUBLIC_PATH_EXACT = new Set([
    '/favicon.ico',
    '/robots.txt',
    '/sitemap.xml',
]);

const STATIC_EXTENSIONS = /\.(ico|png|jpg|jpeg|gif|svg|webp|css|js|woff|woff2|ttf|eot|map|json)$/;

/**
 * Check if a pathname is public (should bypass auth).
 */
export function isPublicPath(pathname: string): boolean {
    // Exact matches
    if (PUBLIC_PATH_EXACT.has(pathname)) return true;

    // Prefix matches
    if (PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p))) return true;

    // Static file extensions
    if (STATIC_EXTENSIONS.test(pathname)) return true;

    return false;
}

/**
 * Check if a pathname is an API route.
 */
export function isApiRoute(pathname: string): boolean {
    return pathname.startsWith('/api/');
}

/**
 * Check if a pathname requires admin role.
 * Recognizes both flat and tenant-scoped admin paths.
 */
export function isAdminPath(pathname: string): boolean {
    // Flat: /admin, /api/admin
    if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) return true;
    // Tenant-scoped: /t/:slug/admin, /api/t/:slug/admin
    if (/^\/t\/[^/]+\/admin/.test(pathname)) return true;
    if (/^\/api\/t\/[^/]+\/admin/.test(pathname)) return true;
    return false;
}

/**
 * Check if a pathname is a tenant-scoped route.
 */
export function isTenantPath(pathname: string): boolean {
    return pathname.startsWith('/t/') || pathname.startsWith('/api/t/');
}

/**
 * Check if a path should remain accessible when MFA is pending.
 * These routes are allowed so users can complete MFA enrollment/challenge.
 */
export function isMfaAllowedPath(pathname: string): boolean {
    // MFA challenge page and enrollment API routes
    if (/^\/t\/[^/]+\/auth\/mfa/.test(pathname)) return true;
    if (/^\/api\/t\/[^/]+\/security\/mfa/.test(pathname)) return true;
    // Auth callbacks (sign-out, etc.)
    if (pathname.startsWith('/api/auth/')) return true;
    return false;
}

/**
 * Sanitize a redirect path to prevent open-redirect attacks.
 * Only allows relative paths starting with '/'.
 * Strips protocol, host, and any absolute URL to return '/'.
 */
export function sanitizeRedirectPath(next: string | null | undefined): string {
    if (!next) return '/';

    // Decode if URL-encoded
    let decoded: string;
    try {
        decoded = decodeURIComponent(next);
    } catch {
        return '/';
    }

    // Strip any protocol + host (prevents https://evil.com)
    // Reject anything that looks like an absolute URL
    if (
        decoded.startsWith('//') ||
        decoded.includes('://') ||
        decoded.startsWith('\\')
    ) {
        return '/';
    }

    // Must start with /
    if (!decoded.startsWith('/')) {
        return '/';
    }

    // Drop any authority component (//evil.com/path)
    const cleaned = decoded.replace(/^\/\/+/, '/');

    return cleaned;
}

/**
 * Build a login redirect URL with a safe 'next' parameter.
 */
export function buildLoginRedirect(
    baseUrl: string,
    pathname: string
): URL {
    const loginUrl = new URL('/login', baseUrl);
    const safeNext = sanitizeRedirectPath(pathname);
    if (safeNext !== '/') {
        loginUrl.searchParams.set('next', safeNext);
    }
    return loginUrl;
}

/**
 * Return a 401 Unauthorized JSON response for API routes.
 */
export function unauthorizedJson(): NextResponse {
    return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
    );
}

/**
 * Return a 403 Forbidden JSON response.
 */
export function forbiddenJson(reason?: string): NextResponse {
    return NextResponse.json(
        { error: reason || 'Forbidden' },
        { status: 403 }
    );
}

/**
 * Extract the tenant slug from a tenant-scoped URL path.
 *
 * Handles both:
 *   /t/:slug/...           → slug
 *   /api/t/:slug/...       → slug
 *
 * Returns null for any path that is not tenant-scoped.
 */
export function extractTenantSlugFromPath(pathname: string): string | null {
    // /t/:slug/...  or  /t/:slug (trailing-slash-less)
    const webMatch = pathname.match(/^\/t\/([^/]+)(?:\/|$)/);
    if (webMatch) return webMatch[1];

    // /api/t/:slug/...
    const apiMatch = pathname.match(/^\/api\/t\/([^/]+)(?:\/|$)/);
    if (apiMatch) return apiMatch[1];

    return null;
}

/**
 * Pure gate function: check whether a JWT tenant slug is allowed to access
 * the given path. Extracted as a pure function so it can be unit-tested
 * without Next.js framework machinery.
 *
 * Returns:
 *   'allow'             — pass through
 *   'no_tenant_access'  — authed user has no tenant membership at all
 *   'cross_tenant'      — authed user's tenant does not match the URL slug
 */
export type TenantGateResult = 'allow' | 'no_tenant_access' | 'cross_tenant';

export function checkTenantAccess(
    pathname: string,
    jwtTenantSlug: string | null | undefined,
): TenantGateResult {
    // Only gate tenant-scoped routes.
    const urlSlug = extractTenantSlugFromPath(pathname);
    if (!urlSlug) return 'allow';

    // Public paths that should always pass (e.g. MFA challenge within a tenant URL).
    // Already checked upstream in isPublicPath, but be defensive.
    if (isPublicPath(pathname)) return 'allow';

    if (!jwtTenantSlug) return 'no_tenant_access';
    if (jwtTenantSlug !== urlSlug) return 'cross_tenant';
    return 'allow';
}
