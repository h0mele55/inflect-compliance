import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import { env } from '@/env';

/**
 * Edge-safe NextAuth config.
 *
 * This file is imported by `src/middleware.ts`, which runs in the
 * Vercel/Next Edge runtime. Edge can't resolve `node:crypto` /
 * `prisma`/`bcrypt` / anything that transitively lands in the Node
 * standard library or a Node-native module.
 *
 * The split is the NextAuth v5 textbook pattern:
 *
 *   ┌────────────────────────────┐   ┌────────────────────────────┐
 *   │  src/auth.config.ts (this) │   │  src/auth.ts               │
 *   │  ─ Edge-safe               │   │  ─ Node-only               │
 *   │  ─ OAuth providers         │   │  ─ Adapter (Prisma)        │
 *   │  ─ Pages / cookies config  │   │  ─ Credentials provider    │
 *   │  ─ No DB, no node:crypto   │   │  ─ Full signIn/jwt/session │
 *   └────────────┬───────────────┘   │    callbacks (touch DB)    │
 *                │                   └────────────┬───────────────┘
 *                ▼                                ▼
 *   ┌────────────────────────────┐   ┌────────────────────────────┐
 *   │  src/middleware.ts         │   │  src/app/api/auth/[...]    │
 *   │  imports auth.config       │   │  imports auth.ts           │
 *   │  → only JWT verification   │   │  → full flow               │
 *   └────────────────────────────┘   └────────────────────────────┘
 *
 * Middleware `auth(req => ...)` in the Edge runtime only needs to
 * VERIFY the existing JWT cookie (signed with `AUTH_SECRET`). It does
 * NOT re-run the `jwt` callback — that runs on the Node side when
 * NextAuth's API routes mint/refresh tokens. So keeping the heavy
 * callbacks out of this config keeps middleware's webpack bundle
 * strictly Edge-compatible.
 *
 * Adding something to this config? Rule of thumb: if it directly
 * imports Prisma, bcrypt, `node:*`, `fs`, or any Node-only module,
 * it belongs in `src/auth.ts`, not here.
 */

export default {
    providers: [
        Google({
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            authorization: {
                params: {
                    access_type: 'offline',
                    prompt: 'consent',
                    scope: 'openid email profile',
                },
            },
        }),
        MicrosoftEntraID({
            clientId: env.MICROSOFT_CLIENT_ID,
            clientSecret: env.MICROSOFT_CLIENT_SECRET,
            issuer: `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/v2.0`,
            authorization: {
                params: {
                    scope: 'openid email profile offline_access',
                },
            },
        }),
    ],
    pages: {
        signIn: '/login',
        error: '/login',
    },
    session: { strategy: 'jwt' },
    callbacks: {
        /**
         * Edge-safe session callback — maps custom JWT token fields into the
         * session object so middleware (which uses this edge config) can read
         * `req.auth.user.memberships` for the tenant-access gate.
         *
         * Must stay pure (no DB, no Node.js builtins) because this runs in
         * the Edge Runtime via src/middleware.ts.
         *
         * Kept minimal: only the fields the middleware actually needs.
         * The full session enrichment (role, tenantId, mfaPending, …) lives
         * in the Node-side session callback in src/auth.ts.
         */
        session({ session, token }) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const t = token as any;
            // Map the memberships array — needed by the middleware tenant-access gate.
            if (Array.isArray(t.memberships)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (session.user as any).memberships = t.memberships;
            }
            // Map role — needed by the middleware admin-path gate.
            if (t.role) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (session.user as any).role = t.role;
            }
            return session;
        },
    },
    cookies: {
        sessionToken: {
            name:
                env.NODE_ENV === 'production' && env.AUTH_TEST_MODE !== '1'
                    ? '__Secure-authjs.session-token'
                    : 'authjs.session-token',
            options: {
                httpOnly: true,
                sameSite: 'lax' as const,
                path: '/',
                secure: env.NODE_ENV === 'production' && env.AUTH_TEST_MODE !== '1',
            },
        },
    },
} satisfies NextAuthConfig;
