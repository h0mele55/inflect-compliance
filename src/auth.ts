import NextAuth from 'next-auth';
import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import prisma from '@/lib/prisma';
import { authenticateWithPassword } from '@/lib/auth/credentials';
import { isTokenExpired, refreshAccessToken } from '@/lib/auth/refresh';
import type { Role } from '@prisma/client';

import authConfig from './auth.config';
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

// Providers list starts with the edge-safe OAuth providers from
// auth.config.ts and extends with the Node-only Credentials provider.
// The edge config can't carry Credentials because authenticateWithPassword
// transitively imports node:crypto (via security-events.ts hashing) and
// Prisma — neither of which is resolvable in the Edge Runtime.
const providers: NextAuthConfig['providers'] = [...authConfig.providers];

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
 * Redeem a tenant-invite token at sign-in time.
 *
 * The token arrives via a cookie set by the `/api/invites/<token>/start-signin`
 * route before the user clicked "sign in to accept".
 *
 * NO-OP when no invite is in flight. That is the point of this function:
 * sign-in alone grants authentication, never tenant membership.
 *
 * Membership is created ONLY via:
 *   1. Token redemption here or through POST /api/invites/:token
 *   2. createTenantWithOwner (platform-admin tenant creation)
 * No other path exists. A guardrail test in PR 5 will enforce this.
 */
async function ensureTenantMembershipFromInvite(
    userId: string,
    userEmail: string,
    inviteToken: string | null,
): Promise<void> {
    if (!inviteToken) return; // the common case
    try {
        const { redeemInvite } = await import('@/app-layer/usecases/tenant-invites');
        await redeemInvite({ token: inviteToken, userId, userEmail });
    } catch (err) {
        // Surface via logger; do NOT fail the sign-in. The user is
        // authenticated; they'll land on /no-tenant where they can
        // see a "this invite is invalid" hint on their next visit.
        edgeLogger.warn('signIn: invite redemption failed', {
            component: 'auth',
            userId,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

/**
 * Read the invite token from the `inflect_invite_token` cookie.
 *
 * The cookie is set by `/api/invites/<token>/start-signin` before the user
 * is redirected to /login. It is HttpOnly and expires in 10 min.
 *
 * Returns null if the cookie is absent or if cookies() is unavailable
 * (some NextAuth internal invocations run outside a Request context).
 */
async function readInviteTokenFromCookies(): Promise<string | null> {
    try {
        const { cookies } = await import('next/headers');
        const cookieStore = await cookies();
        return cookieStore.get('inflect_invite_token')?.value ?? null;
    } catch {
        // cookies() throws outside a Request context — safe to ignore.
        return null;
    }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
    ...authConfig,
    adapter: PrismaAdapter(prisma) as NextAuthConfig['adapter'],
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
         *   2. Invite redemption: if an `inflect_invite_token` cookie is
         *      present (set by /api/invites/:token/start-signin before the
         *      user was redirected to /login), redeem it to create a
         *      TenantMembership. NO auto-join without an invite — this is
         *      the GAP-01 closure.
         *
         * Sign-in alone grants authentication, never tenant membership.
         * Uninvited OAuth users land on /no-tenant after this callback.
         */
        async signIn({ user, account }) {
            if (!account) return true;

            // Invite token lives in a short-lived HttpOnly cookie set by
            // /api/invites/:token/start-signin before OAuth redirect.
            const inviteToken = await readInviteTokenFromCookies();

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
                    // Invite redemption uses the EXISTING user id, not the OAuth-
                    // payload user.id. Use existingUser.id for that.
                    await ensureTenantMembershipFromInvite(
                        existingUser.id,
                        user.email,
                        inviteToken,
                    );
                    return true;
                }
            }

            // ── 2. Invite redemption (no auto-join) ──
            if (user.id && user.email) {
                await ensureTenantMembershipFromInvite(
                    user.id,
                    user.email,
                    inviteToken,
                );
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
                        token.tenantSlug = defaultMembership.tenant?.slug ?? null;
                        token.role = defaultMembership.role;
                    } else {
                        // No membership — user has no tenant access yet
                        token.tenantId = null;
                        token.tenantSlug = null;
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

                // Epic C.3 — record an operational session row so the
                // server can later list/revoke this specific session.
                // Best-effort; a DB failure here logs but does not
                // block sign-in (see session-tracker.ts).
                try {
                    const { recordNewSession } = await import(
                        '@/lib/security/session-tracker'
                    );
                    // NextAuth defaults the JWT max-age to 30 days; we
                    // mirror that here. If the auth.config maxAge ever
                    // changes, plumb it through `token.expires` instead.
                    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
                    const recorded = await recordNewSession({
                        userId: token.userId as string,
                        tenantId: (token.tenantId as string) ?? null,
                        expiresAt: new Date(Date.now() + THIRTY_DAYS_MS),
                    });
                    token.userSessionId = recorded.sessionId;
                } catch {
                    // Already swallowed in the helper; nothing left to do.
                }

                return token;
            }

            // Epic C.3 — verify the session still exists + isn't revoked.
            // Throttled `lastActiveAt` write happens inside the helper.
            if (typeof token.userSessionId === 'string' && token.userSessionId) {
                try {
                    const { verifyAndTouchSession } = await import(
                        '@/lib/security/session-tracker'
                    );
                    const result = await verifyAndTouchSession(
                        token.userSessionId,
                    );
                    if (result.revoked) {
                        return { ...token, error: 'SessionRevoked' };
                    }
                } catch {
                    // Helper already logs; fail-open on telemetry-side
                    // failures so a transient DB blip doesn't sign every
                    // user out. The classic sessionVersion check below
                    // is still in force as a backstop.
                }
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
});
