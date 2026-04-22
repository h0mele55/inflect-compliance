import NextAuth from 'next-auth';
import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import prisma from '@/lib/prisma';
import { authenticateWithPassword } from '@/lib/auth/credentials';
import { isTokenExpired, refreshAccessToken } from '@/lib/auth/refresh';
import type { Role } from '@prisma/client';

import { env } from '@/env';
import { edgeLogger } from '@/lib/observability/edge-logger';

// Note: AUTH_SECRET is required at runtime. Auth.js v5 will
// throw a descriptive error if it is missing at request time.

/**
 * Extend Auth.js types for our custom session fields.
 * access_token and refresh_token are NEVER exposed to the client-side session.
 */
declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
            email: string;
            name?: string | null;
            image?: string | null;
            tenantId?: string | null;
            role: Role;
            mfaPending?: boolean;
        };
    }
}

// Build providers list
const providers: NextAuthConfig['providers'] = [
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
];

// Credentials provider — production-grade email+password auth.
//
// Previously gated behind `AUTH_TEST_MODE === '1' || NODE_ENV !== 'production'`
// on the grounds that the inline bcrypt.compare + no-enumeration-protection
// implementation wasn't safe to face the internet. The production path now
// lives in `src/lib/auth/credentials.ts` (account-enumeration-safe, timing-
// equalised, email-verification-gate-ready, silent-rehash-on-verify) so the
// provider is always registered. Whether the login UI shows the email/
// password *form* is a separate orthogonal decision — the login page calls
// `getProviders()` and renders conditionally (see src/app/login/page.tsx).
providers.push(
    Credentials({
        id: 'credentials',
        name: 'Email and password',
        credentials: {
            email: { label: 'Email', type: 'email' },
            password: { label: 'Password', type: 'password' },
        },
        async authorize(credentials) {
            const result = await authenticateWithPassword({
                email: (credentials?.email as string | undefined) ?? '',
                password: (credentials?.password as string | undefined) ?? '',
            });
            // NextAuth surfaces any non-null return as a successful sign-in
            // and dispatches the `signIn` + `jwt` callbacks. Returning null
            // collapses every failure reason into the same client-facing
            // `CredentialsSignin` error — which is exactly the account-
            // enumeration-safe shape we want. Callers that need the typed
            // reason (for audit logging, rate-limit reasons) should invoke
            // authenticateWithPassword directly rather than signIn.
            if (!result.ok) return null;
            return {
                id: result.userId,
                email: result.email,
                name: result.name,
            };
        },
    }),
);

/**
 * Join the user to the oldest active tenant as EDITOR if they have no
 * membership yet. Idempotent — the upsert is a no-op when membership
 * already exists. Swallows errors so auth callbacks never fail-close
 * over a housekeeping blip; the worst case is the user bounces to
 * /login with tenantId=null, which is no worse than the pre-fix state.
 *
 * Lives at module scope (not inside the NextAuth config object) so
 * both the account-linking branch and the plain auto-onboard branch
 * of the signIn callback can call it.
 */
async function ensureDefaultTenantMembership(userId: string): Promise<void> {
    try {
        const existing = await prisma.tenantMembership.findFirst({
            where: { userId, status: 'ACTIVE' },
            select: { id: true },
        });
        if (existing) return; // already a member of at least one tenant

        const tenant = await prisma.tenant.findFirst({
            orderBy: { createdAt: 'asc' },
            select: { id: true },
        });
        if (!tenant) {
            edgeLogger.warn('signIn: no tenant exists to auto-join', {
                component: 'auth',
                userId,
            });
            return;
        }

        await prisma.tenantMembership.upsert({
            where: { tenantId_userId: { tenantId: tenant.id, userId } },
            update: {},
            create: {
                tenantId: tenant.id,
                userId,
                role: 'EDITOR',
                status: 'ACTIVE',
            },
        });
    } catch (err) {
        edgeLogger.error('signIn: ensureDefaultTenantMembership failed', {
            component: 'auth',
            userId,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: PrismaAdapter(prisma) as NextAuthConfig['adapter'],
    session: { strategy: 'jwt' },
    pages: {
        signIn: '/login',
        error: '/login',
    },
    providers,
    callbacks: {
        /**
         * signIn callback — runs on EVERY sign-in attempt (not just the
         * first). Does two things:
         *
         *   1. Account linking: if the OAuth email already matches a
         *      User row created by a different provider, link the new
         *      OAuth `Account` to the existing User rather than
         *      creating a duplicate.
         *
         *   2. Auto-onboard / self-heal: ensure the user has at least
         *      one ACTIVE `TenantMembership`. If not, join them to the
         *      oldest tenant as EDITOR. Idempotent via upsert.
         *
         * The auto-onboard moved out of `events.createUser` (where it
         * used to live) because that hook only fires on first User
         * creation. Orphan users whose User row got created during a
         * deploy window before auto-onboarding shipped would stay
         * orphaned forever — signing in, creating a session with
         * `tenantId=null`, and bouncing back to /login. Running the
         * check on every sign-in gives us self-healing: orphans are
         * repaired on their next login, brand-new users are onboarded
         * on their first.
         *
         * Current bootstrap policy: oldest tenant, EDITOR role,
         * ACTIVE status. Matches the "single test tenant" stance on
         * the prod VM while invitation tokens aren't built yet. As
         * written, ANY successful OAuth sign-in (Google/Microsoft)
         * self-joins that tenant.
         */
        async signIn({ user, account }) {
            if (!account) return true;

            // ── 1. Account linking for OAuth (not credentials) ──
            if (account.provider !== 'credentials' && user.email) {
                const existingUser = await prisma.user.findUnique({
                    where: { email: user.email },
                });

                if (existingUser && user.id !== existingUser.id) {
                    const existingAccount = await prisma.account.findUnique({
                        where: {
                            provider_providerAccountId: {
                                provider: account.provider,
                                providerAccountId: account.providerAccountId,
                            },
                        },
                    });

                    if (!existingAccount) {
                        await prisma.account.create({
                            data: {
                                userId: existingUser.id,
                                type: account.type,
                                provider: account.provider,
                                providerAccountId: account.providerAccountId,
                                refresh_token: (account.refresh_token as string) ?? null,
                                access_token: (account.access_token as string) ?? null,
                                expires_at: (account.expires_at as number) ?? null,
                                token_type: (account.token_type as string) ?? null,
                                scope: (account.scope as string) ?? null,
                                id_token: (account.id_token as string) ?? null,
                                session_state: (account.session_state as string) ?? null,
                            },
                        });
                    }
                    // Fall through to the membership check below — we
                    // want to onboard the EXISTING user, not the OAuth-
                    // payload user.id. Use existingUser.id for that.
                    await ensureDefaultTenantMembership(existingUser.id);
                    return true;
                }
            }

            // ── 2. Auto-onboard / self-heal ──
            if (user.id) {
                await ensureDefaultTenantMembership(user.id);
            }
            return true;
        },

        /**
         * JWT callback: enrich token with our custom fields.
         * Handles token refresh for OAuth providers.
         */
        async jwt({ token, user, account }) {
            // Initial sign in
            if (account && user) {
                // Look up our internal user by email
                const dbUser = await prisma.user.findUnique({
                    where: { email: token.email! },
                    include: {
                        tenantMemberships: {
                            orderBy: { createdAt: 'asc' },
                            take: 1,
                            include: { tenant: true },
                        },
                    },
                });

                if (dbUser) {
                    token.userId = dbUser.id;
                    token.sessionVersion = dbUser.sessionVersion;
                    // Resolve from TenantMembership (sole authority)
                    const defaultMembership = dbUser.tenantMemberships[0];
                    if (defaultMembership) {
                        token.tenantId = defaultMembership.tenantId;
                        token.role = defaultMembership.role;
                    } else {
                        // No membership — user has no tenant access yet
                        token.tenantId = null;
                        token.role = 'READER' as Role;
                    }
                } else {
                    token.userId = user.id!;
                    token.role = 'READER' as Role;
                    token.sessionVersion = 0;
                }

                // Store provider tokens for refresh (server-side JWT only)
                if (account.provider !== 'credentials') {
                    token.provider = account.provider;
                    token.accessToken = (account.access_token as string) ?? undefined;
                    token.refreshToken = (account.refresh_token as string) ?? undefined;
                    token.expiresAt = (account.expires_at as number) ?? undefined;
                }

                // ── MFA enforcement check ──
                // Determine if MFA challenge is needed based on tenant policy
                token.mfaPending = false;
                const activeTenantId = (token.tenantId as string) || null;
                if (activeTenantId) {
                    try {
                        const secSettings = await prisma.tenantSecuritySettings.findUnique({
                            where: { tenantId: activeTenantId },
                        });
                        const policy = secSettings?.mfaPolicy ?? 'DISABLED';
                        const failClosed = secSettings?.mfaFailClosed ?? false;

                        // Cache fail-closed setting in token for subsequent requests
                        token.mfaFailClosed = failClosed;

                        if (policy === 'REQUIRED' || policy === 'OPTIONAL') {
                            // Check if user has a verified MFA enrollment
                            const enrollment = await prisma.userMfaEnrollment.findUnique({
                                where: {
                                    userId_tenantId_type: {
                                        userId: token.userId as string,
                                        tenantId: activeTenantId,
                                        type: 'TOTP',
                                    },
                                },
                            });

                            if (policy === 'REQUIRED') {
                                // REQUIRED: always challenge (enrolled+verified → challenge code;
                                // not enrolled → redirect to enrollment)
                                token.mfaPending = true;
                            } else if (policy === 'OPTIONAL' && enrollment?.isVerified) {
                                // OPTIONAL: only challenge if user has voluntarily enrolled
                                token.mfaPending = true;
                            }
                        }
                    } catch {
                        // MFA dependency failure (DB outage, lookup error)
                        // Fail-closed: deny access when tenant has opted in
                        // Fail-open (default): allow through for availability
                        if (token.mfaFailClosed) {
                            token.mfaPending = true;
                            token.error = 'MfaDependencyFailure';
                        }
                    }
                }

                return token;
            }

            // Subsequent requests — check if OAuth token needs refresh
            if (
                token.provider &&
                token.expiresAt &&
                token.refreshToken &&
                isTokenExpired(token.expiresAt as number)
            ) {
                try {
                    const refreshed = await refreshAccessToken(
                        token.provider as string,
                        token.refreshToken as string
                    );

                    token.accessToken = refreshed.accessToken;
                    token.expiresAt = refreshed.expiresAt;
                    if (refreshed.refreshToken) {
                        token.refreshToken = refreshed.refreshToken;
                    }
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    delete (token as any).error;

                    // Update stored tokens in the database Account record
                    await prisma.account.updateMany({
                        where: {
                            userId: token.userId as string,
                            provider: token.provider as string,
                        },
                        data: {
                            access_token: refreshed.accessToken,
                            expires_at: refreshed.expiresAt,
                            ...(refreshed.refreshToken
                                ? { refresh_token: refreshed.refreshToken }
                                : {}),
                        },
                    });
                } catch (error) {
                    edgeLogger.error('Token refresh failed, forcing reauth', { component: 'auth' });
                    token.error = 'RefreshTokenError';
                }
            }

            // Check MFA challenge completion: if mfaPending, see if user completed challenge
            if (token.mfaPending === true && token.userId && token.tenantId) {
                try {
                    const enrollment = await prisma.userMfaEnrollment.findUnique({
                        where: {
                            userId_tenantId_type: {
                                userId: token.userId as string,
                                tenantId: token.tenantId as string,
                                type: 'TOTP',
                            },
                        },
                        select: { lastChallengeAt: true, isVerified: true },
                    });

                    if (enrollment?.lastChallengeAt) {
                        // Challenge was completed — check it's after token creation
                        const tokenIat = (token.iat as number) || 0;
                        const challengeTime = Math.floor(enrollment.lastChallengeAt.getTime() / 1000);
                        if (challengeTime >= tokenIat) {
                            token.mfaPending = false;
                        }
                    }
                } catch {
                    // MFA challenge completion check failed
                    // Fail-closed: keep mfaPending=true (deny access)
                    // Fail-open (default): don't block access
                    if (token.mfaFailClosed) {
                        // mfaPending remains true — access is denied
                        token.error = 'MfaDependencyFailure';
                    } else {
                        // Fail open — allow through
                        token.mfaPending = false;
                    }
                }
            }

            if (typeof token.sessionVersion === 'number' && token.userId) {
                // Throttle: only re-check session version every 5 minutes to avoid
                // a Prisma DB call on every single middleware-intercepted request.
                const SESSION_CHECK_INTERVAL = 300; // seconds
                const now = Math.floor(Date.now() / 1000);
                const lastChecked = (token.sessionVersionCheckedAt as number) || 0;
                if (now - lastChecked >= SESSION_CHECK_INTERVAL) {
                    try {
                        const currentUser = await prisma.user.findUnique({
                            where: { id: token.userId as string },
                            select: { sessionVersion: true },
                        });
                        if (currentUser && currentUser.sessionVersion > (token.sessionVersion as number)) {
                            return { ...token, error: 'SessionRevoked' };
                        }
                        token.sessionVersionCheckedAt = now;
                    } catch {
                        // If session version check fails, don't invalidate the session — fail open
                    }
                }
            }

            return token;
        },

        /**
         * Session callback: expose ONLY safe fields to the client.
         * NEVER include accessToken or refreshToken.
         */
        async session({ session, token }) {
            if (token) {
                session.user.id = token.userId as string ?? token.sub!;
                session.user.tenantId = (token.tenantId as string) ?? null;
                session.user.role = (token.role as Role) ?? 'READER';
                session.user.mfaPending = (token.mfaPending as boolean) ?? false;
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
});
