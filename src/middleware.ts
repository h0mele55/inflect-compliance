import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { checkAuthRateLimit } from '@/lib/rate-limit/authRateLimit';
import { env } from '@/env';
import {
    isPublicPath,
    isApiRoute,
    isAdminPath,
    buildLoginRedirect,
    unauthorizedJson,
    forbiddenJson,
} from '@/lib/auth/guard';

/**
 * Edge middleware: centralized auth guard for ALL routes.
 *
 * Behavior:
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
        // If authorized, we should append the rate limit headers to the final response
        // but NextAuth wrapper makes it hard to mutate downstream headers directly here.
        // Returning the response isn't possible yet (NextAuth handles it). 
        // We'll let it pass through.
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
        // Browser page → redirect to login with safe 'next' param
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
            // Page → redirect back to dashboard (they're authed but not admin)
            return NextResponse.redirect(new URL('/', req.nextUrl.origin));
        }
    }

    // ── 4. Authenticated and authorized → proceed ──
    return NextResponse.next();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function middleware(req: any, ctx: any) {
    const { pathname } = req.nextUrl;



    const origin = req.headers.get('origin') ?? '';

    // Parse allowed origins from env or default to localhost for dev
    const allowedOrigins = env.CORS_ALLOWED_ORIGINS
        ? env.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim())
        : [];

    // Allow if in origin list or localhost in development
    const isAllowedOrigin = allowedOrigins.includes(origin) || origin.startsWith('http://localhost:');

    // ── CORS Preflight for APIs ──
    if (pathname.startsWith('/api/') && req.method === 'OPTIONS') {
        const preflightHeaders = new Headers();
        if (isAllowedOrigin && origin) {
            preflightHeaders.set('Access-Control-Allow-Origin', origin);
            preflightHeaders.set('Access-Control-Allow-Credentials', 'true');
        }
        preflightHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
        preflightHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-forwarded-for, user-agent');
        preflightHeaders.set('Access-Control-Max-Age', '86400');
        return new NextResponse(null, { status: 204, headers: preflightHeaders });
    }

    // Process through auth middleware
    const res = await authMiddleware(req, ctx) || NextResponse.next();

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
