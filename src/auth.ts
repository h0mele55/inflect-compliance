import NextAuth from 'next-auth';
import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import prisma from '@/lib/prisma';
import { isTokenExpired, refreshAccessToken } from '@/lib/auth/refresh';
import type { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { env } from '@/env';

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

// Test-only Credentials provider — gated to prevent production use
if (
    env.AUTH_TEST_MODE === '1' &&
    env.NODE_ENV !== 'production'
) {
    providers.push(
        Credentials({
            id: 'credentials',
            name: 'Test Credentials',
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) return null;

                const email = credentials.email as string;
                const password = credentials.password as string;

                const user = await prisma.user.findUnique({
                    where: { email },
                });

                if (!user || !user.passwordHash) return null;

                const valid = await bcrypt.compare(password, user.passwordHash);
                if (!valid) return null;

                return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                };
            },
        })
    );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: PrismaAdapter(prisma) as NextAuthConfig['adapter'],
    session: { strategy: 'jwt' },
    pages: {
        signIn: '/login',
    },
    providers,
    callbacks: {
        /**
         * signIn callback: link OAuth user to existing tenant user by email.
         */
        async signIn({ user, account }) {
            if (!account || account.provider === 'credentials') return true;

            // Find existing user by email and link them
            if (user.email) {
                const existingUser = await prisma.user.findUnique({
                    where: { email: user.email },
                });

                if (existingUser && user.id !== existingUser.id) {
                    // User exists — check if this provider already linked
                    const existingAccount = await prisma.account.findUnique({
                        where: {
                            provider_providerAccountId: {
                                provider: account.provider,
                                providerAccountId: account.providerAccountId,
                            },
                        },
                    });

                    if (!existingAccount) {
                        // Link this OAuth provider to the existing user
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
                    return true;
                }
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
                    // Resolve from TenantMembership (authoritative)
                    const defaultMembership = dbUser.tenantMemberships[0];
                    if (defaultMembership) {
                        token.tenantId = defaultMembership.tenantId;
                        token.role = defaultMembership.role;
                    } else {
                        // Fallback to deprecated User fields during migration
                        token.tenantId = dbUser.tenantId;
                        token.role = dbUser.role;
                    }
                } else {
                    token.userId = user.id!;
                    token.role = 'READER' as Role;
                }

                // Store provider tokens for refresh (server-side JWT only)
                if (account.provider !== 'credentials') {
                    token.provider = account.provider;
                    token.accessToken = (account.access_token as string) ?? undefined;
                    token.refreshToken = (account.refresh_token as string) ?? undefined;
                    token.expiresAt = (account.expires_at as number) ?? undefined;
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
                    console.error('[auth] Token refresh failed, forcing reauth');
                    token.error = 'RefreshTokenError';
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
            }
            return session;
        },
    },
    cookies: {
        sessionToken: {
            name:
                env.NODE_ENV === 'production'
                    ? '__Secure-authjs.session-token'
                    : 'authjs.session-token',
            options: {
                httpOnly: true,
                sameSite: 'lax' as const,
                path: '/',
                secure: env.NODE_ENV === 'production',
            },
        },
    },
});
