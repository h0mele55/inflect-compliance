import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { checkAuthRateLimit } from '@/lib/rate-limit/authRateLimit';
import { env } from '@/env';
import {
    isPublicPath,
    isApiRoute,
    isAdminPath,
    isTenantPath,
    isMfaAllowedPath,
    buildLoginRedirect,
    unauthorizedJson,
    forbiddenJson,
} from '@/lib/auth/guard';
import { generateNonce, buildCspHeader, CSP_NONCE_HEADER, CSP_REPORT_PATH, CSP_REPORT_GROUP, getCspHeaderName, isCspReportOnly } from '@/lib/security/csp';
import { applySecurityHeaders } from '@/lib/security/headers';
import { resolveCorsConfig, isOriginAllowed, applyCorsHeaders, CORS_PREFLIGHT_HEADERS } from '@/lib/security/cors';
import { shouldBlockAdminRequest } from '@/lib/security/admin-session-guard';

/**
 * Edge middleware: centralized auth guard + CSP for ALL routes.
 *
 * CSP flow:
 *   1. Generate cryptographic nonce per request
 *   2. Pass nonce to server components via x-csp-nonce request header
 *   3. Set Content-Security-Policy response header with nonce
 *
 * Auth behavior:
 *   ┌──────────────────┬───────────────┬──────────────────────────┐
 *   │ Route type       │ Unauthed      │ Authed but wrong role    │
 *   ├──────────────────┼───────────────┼──────────────────────────┤
 *   │ /api/*           │ 401 JSON      │ 403 JSON                 │
 *   │ App pages        │ redirect →    │ 403 redirect to /login   │
 *   │                  │  /login?next= │                          │
 *   │ Public paths     │ allowed       │ allowed                  │
 *   └──────────────────┴───────────────┴──────────────────────────┘
 */



const authMiddleware = auth(async (req) => {
    const { pathname } = req.nextUrl;

    // ── 0. Rate Limit Auth Endpoints ──
    if (pathname.startsWith('/api/auth/')) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rlResult = await checkAuthRateLimit(req as any);
        if (!rlResult.ok && rlResult.response) {
            return rlResult.response;
        }
    }

    // ── 1. Allow public paths (login, auth callbacks, static, etc.) ──
    if (isPublicPath(pathname)) {
        return NextResponse.next();
    }

    // ── 2. Unauthenticated? ──
    if (!req.auth) {
        if (isApiRoute(pathname)) {
            return unauthorizedJson();
        }
        const proto = req.headers.get('x-forwarded-proto') || 'http';
        const host = req.headers.get('host') || req.nextUrl.host;
        const origin = `${proto}://${host}`;
        return NextResponse.redirect(
            buildLoginRedirect(origin, pathname)
        );
    }

    // ── 3. Admin-only paths ──
    if (isAdminPath(pathname)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const role = (req.auth as any)?.user?.role;
        const ADMIN_ROLES = new Set(['ADMIN']);
        if (!role || !ADMIN_ROLES.has(role)) {
            if (isApiRoute(pathname)) {
                return forbiddenJson('Admin access required');
            }
            // Redirect to tenant dashboard instead of root / to avoid redirect chain.
            // Extract tenant slug from URL: /t/:slug/admin/...
            const slugMatch = pathname.match(/^\/t\/([^/]+)\//);
            const redirectTo = slugMatch
                ? new URL(`/t/${slugMatch[1]}/dashboard`, req.nextUrl.origin)
                : new URL('/', req.nextUrl.origin);
            return NextResponse.redirect(redirectTo);
        }

        // Admin role confirmed — enforce stricter session posture.
        // Block cross-site requests to admin API routes (Sec-Fetch-Site check).
        // This provides equivalent protection to SameSite=strict cookies
        // without breaking OAuth redirect flows that require SameSite=lax.
        if (isApiRoute(pathname)) {
            const secFetchSite = req.headers.get('sec-fetch-site');
            const method = req.method || 'GET';
            if (shouldBlockAdminRequest(secFetchSite, method)) {
                return forbiddenJson('Cross-site admin requests are not allowed');
            }
        }
    }

    // ── 4. MFA enforcement ──
    if (isTenantPath(pathname) && !isMfaAllowedPath(pathname)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const session = req.auth as any;
        const mfaPending = session?.user?.mfaPending === true;

        if (mfaPending) {
            // Extract tenant slug from path: /t/:slug/... or /api/t/:slug/...
            const segments = pathname.split('/');
            const tIndex = segments.indexOf('t');
            const tenantSlug = tIndex >= 0 ? segments[tIndex + 1] : null;

            if (isApiRoute(pathname)) {
                return forbiddenJson('MFA verification required');
            }

            // Redirect to MFA challenge page
            if (tenantSlug) {
                const mfaUrl = new URL(`/t/${tenantSlug}/auth/mfa`, req.nextUrl.origin);
                mfaUrl.searchParams.set('next', pathname);
                return NextResponse.redirect(mfaUrl);
            }
        }
    }

    // ── 5. Authenticated and authorized → proceed ──
    return NextResponse.next();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function middleware(req: any, ctx: any) {
    const { pathname } = req.nextUrl;

    // ── CSP Nonce — generated once per request ──
    const nonce = generateNonce();
    const isDev = env.NODE_ENV === 'development';
    const cspHeader = buildCspHeader(nonce, isDev);
    const cspReportOnly = isCspReportOnly(process.env.CSP_REPORT_ONLY);
    const cspHeaderName = getCspHeaderName(cspReportOnly);

    // ── Request ID (reuse from upstream or generate) ──
    const requestId = req.headers.get('x-request-id') || crypto.randomUUID();

    // ── Pass nonce to server components via request header ──
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set(CSP_NONCE_HEADER, nonce);
    requestHeaders.set('x-request-id', requestId);

    const origin = req.headers.get('origin') ?? '';

    // ── CORS Policy — environment-aware, fail-closed in production ──
    const corsConfig = resolveCorsConfig(env.CORS_ALLOWED_ORIGINS, env.NODE_ENV);
    const isAllowedOrigin = isOriginAllowed(origin, corsConfig);
    const isProduction = env.NODE_ENV === 'production';

    // ── CORS Preflight for APIs ──
    if (pathname.startsWith('/api/') && req.method === 'OPTIONS') {
        const preflightHeaders = new Headers();
        if (isAllowedOrigin && origin) {
            applyCorsHeaders(preflightHeaders, origin);
        }
        for (const [key, value] of Object.entries(CORS_PREFLIGHT_HEADERS)) {
            preflightHeaders.set(key, value);
        }
        preflightHeaders.set('x-request-id', requestId);
        preflightHeaders.set(cspHeaderName, cspHeader);
        applySecurityHeaders(preflightHeaders, isProduction);
        return new NextResponse(null, { status: 204, headers: preflightHeaders });
    }

    // ── Process through auth middleware (with nonce on request headers) ──
    const res = await authMiddleware(req, ctx) || NextResponse.next({
        request: { headers: requestHeaders },
    });

    // ── Security Headers — applied to ALL responses ──
    applySecurityHeaders(res.headers, isProduction);

    // ── Inject CSP + Report-To + request ID on every response ──
    res.headers.set(cspHeaderName, cspHeader);
    res.headers.set('x-request-id', requestId);

    // Report-To header for the modern Reporting API (report-to CSP directive)
    res.headers.set('Report-To', JSON.stringify({
        group: CSP_REPORT_GROUP,
        max_age: 86400,
        endpoints: [{ url: CSP_REPORT_PATH }],
    }));

    // Reporting-Endpoints header (newer alternative, Chrome 96+)
    res.headers.set('Reporting-Endpoints', `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`);

    // ── Apply CORS Headers to API responses (environment-locked) ──
    if (pathname.startsWith('/api/') && isAllowedOrigin && origin) {
        applyCorsHeaders(res.headers, origin);
    }

    return res;
}

/**
 * Matcher: run middleware on all routes EXCEPT static assets.
 * The public path check inside the middleware handles /login, /api/auth, etc.
 */
export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)',
    ],
};
