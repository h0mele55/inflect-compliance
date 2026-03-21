import prisma from '@/lib/prisma';
import type { UserIdentityLink } from '@prisma/client';

/**
 * Repository for UserIdentityLink — maps external IdP identities to local users.
 */

/**
 * Find an existing identity link by provider + external subject.
 * This is the primary lookup during SSO callback.
 */
export async function findByProviderAndSubject(
    providerId: string,
    externalSubject: string
): Promise<UserIdentityLink | null> {
    return prisma.userIdentityLink.findUnique({
        where: {
            providerId_externalSubject: {
                providerId,
                externalSubject,
            },
        },
    });
}

/**
 * Find an existing identity link for a user on a specific provider.
 */
export async function findByUserAndProvider(
    userId: string,
    providerId: string
): Promise<UserIdentityLink | null> {
    return prisma.userIdentityLink.findUnique({
        where: {
            userId_providerId: {
                userId,
                providerId,
            },
        },
    });
}

/**
 * List all identity links for a user across all providers.
 */
export async function findByUserId(userId: string): Promise<UserIdentityLink[]> {
    return prisma.userIdentityLink.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
    });
}

/**
 * Create a new identity link between a local user and an external IdP identity.
 */
export async function linkIdentity(data: {
    userId: string;
    tenantId: string;
    providerId: string;
    externalSubject: string;
    emailAtLinkTime: string;
}): Promise<UserIdentityLink> {
    return prisma.userIdentityLink.create({
        data: {
            userId: data.userId,
            tenantId: data.tenantId,
            providerId: data.providerId,
            externalSubject: data.externalSubject,
            emailAtLinkTime: data.emailAtLinkTime,
            lastLoginAt: new Date(),
        },
    });
}

/**
 * Remove an identity link.
 */
export async function unlinkIdentity(userId: string, providerId: string): Promise<void> {
    await prisma.userIdentityLink.deleteMany({
        where: { userId, providerId },
    });
}

/**
 * Update the last login timestamp for an identity link.
 */
export async function updateLastLogin(id: string): Promise<void> {
    await prisma.userIdentityLink.update({
        where: { id },
        data: { lastLoginAt: new Date() },
    });
}
