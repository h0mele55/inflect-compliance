/**
 * Tenant context resolvers.
 *
 * These functions resolve the current tenant context for a request,
 * using TenantMembership as the authoritative source of truth.
 *
 * Design decisions:
 *   - Permissions are computed from the tenant membership role
 */
import prisma from './prisma';
import { notFound, forbidden } from '@/lib/errors/types';
import type { Role, Tenant, TenantMembership } from '@prisma/client';
import { getPermissionsForRole, type PermissionSet } from '@/lib/permissions';

// ─── Permission shape ───

export interface Permissions {
    canRead: boolean;
    canWrite: boolean;
    canAdmin: boolean;
    canAudit: boolean;
    canExport: boolean;
}

export interface TenantContext {
    tenant: Tenant;
    membership: TenantMembership;
    role: Role;
    permissions: Permissions;
    appPermissions: PermissionSet;
}

// ─── Permission calculator ───

const ROLE_ORDER: Record<Role, number> = {
    ADMIN: 4,
    EDITOR: 3,
    AUDITOR: 2,
    READER: 1,
};

export function computePermissions(role: Role): Permissions {
    const level = ROLE_ORDER[role] ?? 0;
    return {
        canRead: level >= 1,
        canWrite: level >= 3,
        canAdmin: level >= 4,
        canAudit: role === 'AUDITOR' || level >= 4,
        canExport: level >= 2,
    };
}

// ─── Tenant context resolver ───

export async function resolveTenantContext(
    params: { tenantSlug?: string; tenantId?: string },
    userId: string
): Promise<TenantContext> {
    let tenant: Tenant | null = null;

    if (params.tenantSlug) {
        tenant = await prisma.tenant.findUnique({
            where: { slug: params.tenantSlug },
        });
    } else if (params.tenantId) {
        tenant = await prisma.tenant.findUnique({
            where: { id: params.tenantId },
        });
    } else {
        throw notFound('Tenant identifier required');
    }

    if (!tenant) {
        throw notFound('Tenant not found');
    }

    const membership = await prisma.tenantMembership.findUnique({
        where: {
            tenantId_userId: {
                tenantId: tenant.id,
                userId,
            },
        },
    });

    if (!membership) {
        throw forbidden('Not a member of this tenant');
    }

    // Block deactivated or removed members from accessing tenant resources
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const memberStatus = (membership as any).status;
    if (memberStatus === 'DEACTIVATED') {
        throw forbidden('Your account has been deactivated by a tenant administrator. Contact your admin for access.');
    }
    if (memberStatus === 'REMOVED') {
        throw forbidden('You are no longer a member of this tenant.');
    }

    return {
        tenant,
        membership,
        role: membership.role,
        permissions: computePermissions(membership.role),
        appPermissions: getPermissionsForRole(membership.role),
    };
}

// ─── Default tenant helper ───

/**
 * Get the default tenant for a user (first membership by creation date).
 *
 * @param userId - The user's ID
 * @returns TenantMembership with tenant, or null if user has no memberships
 */
export async function getDefaultTenantForUser(
    userId: string
): Promise<(TenantMembership & { tenant: Tenant }) | null> {
    return prisma.tenantMembership.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        include: { tenant: true },
    });
}
