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
import { generateNonce, buildCspHeader, CSP_NONCE_HEADER, CSP_REPORT_PATH, CSP_REPORT_GROUP } from '@/lib/security/csp';

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

    // ── Request ID (reuse from upstream or generate) ──
    const requestId = req.headers.get('x-request-id') || crypto.randomUUID();

    // ── Pass nonce to server components via request header ──
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set(CSP_NONCE_HEADER, nonce);
    requestHeaders.set('x-request-id', requestId);

    const origin = req.headers.get('origin') ?? '';

    // Parse allowed origins from env or default to localhost for dev
    const allowedOrigins = env.CORS_ALLOWED_ORIGINS
        ? env.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim())
        : [];

    const isAllowedOrigin = allowedOrigins.includes(origin) || origin.startsWith('http://localhost:');

    // ── CORS Preflight for APIs ──
    if (pathname.startsWith('/api/') && req.method === 'OPTIONS') {
        const preflightHeaders = new Headers();
        if (isAllowedOrigin && origin) {
            preflightHeaders.set('Access-Control-Allow-Origin', origin);
            preflightHeaders.set('Access-Control-Allow-Credentials', 'true');
        }
        preflightHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
        preflightHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-forwarded-for, x-request-id, user-agent');
        preflightHeaders.set('Access-Control-Max-Age', '86400');
        preflightHeaders.set('x-request-id', requestId);
        preflightHeaders.set('Content-Security-Policy', cspHeader);
        return new NextResponse(null, { status: 204, headers: preflightHeaders });
    }

    // ── Process through auth middleware (with nonce on request headers) ──
    const res = await authMiddleware(req, ctx) || NextResponse.next({
        request: { headers: requestHeaders },
    });

    // ── Inject CSP + Report-To + request ID on every response ──
    res.headers.set('Content-Security-Policy', cspHeader);
    res.headers.set('x-request-id', requestId);

    // Report-To header for the modern Reporting API (report-to CSP directive)
    res.headers.set('Report-To', JSON.stringify({
        group: CSP_REPORT_GROUP,
        max_age: 86400,
        endpoints: [{ url: CSP_REPORT_PATH }],
    }));

    // Reporting-Endpoints header (newer alternative, Chrome 96+)
    res.headers.set('Reporting-Endpoints', `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`);

    // ── Apply CORS Headers to API responses ──
    if (pathname.startsWith('/api/') && isAllowedOrigin && origin) {
        res.headers.set('Access-Control-Allow-Origin', origin);
        res.headers.set('Access-Control-Allow-Credentials', 'true');
        res.headers.append('Vary', 'Origin');
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
