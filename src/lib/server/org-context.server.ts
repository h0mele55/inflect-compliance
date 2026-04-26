/**
 * Server-side org context resolver — Epic O-4.
 *
 * Mirror of `getTenantServerContext` for the hub-and-spoke org layer.
 * Returns a plain serializable shape that flows from the server
 * `org/[orgSlug]/layout.tsx` into the client `OrgProvider` without
 * dragging Prisma model internals across the server-client boundary.
 *
 * Auth shape:
 *   - Throws `notFoundError` if the org slug doesn't resolve.
 *   - Throws `forbiddenError` if the user has no OrgMembership in
 *     that org.
 *
 * The thrown errors are caught by the layout's try/catch which routes
 * them to `notFound()` (404 → renders the not-found UI without
 * leaking org existence to non-members).
 */

import prisma from '@/lib/prisma';
import { getOrgPermissions, type OrgPermissionSet } from '@/lib/permissions';
import { ForbiddenError, NotFoundError } from '@/lib/errors/types';
import type { OrgRole } from '@prisma/client';

export interface OrgServerContext {
    organization: {
        id: string;
        slug: string;
        name: string;
    };
    role: OrgRole;
    permissions: OrgPermissionSet;
}

export async function getOrgServerContext(params: {
    orgSlug: string;
    userId: string;
}): Promise<OrgServerContext> {
    const slug = params.orgSlug.trim();
    if (!slug) {
        throw new NotFoundError(`Organization not found`);
    }

    const org = await prisma.organization.findUnique({
        where: { slug },
        select: { id: true, slug: true, name: true },
    });
    if (!org) {
        throw new NotFoundError(`Organization '${slug}' not found`);
    }

    const membership = await prisma.orgMembership.findUnique({
        where: {
            organizationId_userId: {
                organizationId: org.id,
                userId: params.userId,
            },
        },
        select: { role: true },
    });
    if (!membership) {
        // Generic message — does NOT echo the slug. Same anti-
        // enumeration posture as `getOrgCtx` in the API layer.
        throw new ForbiddenError('Access to this organization is not permitted');
    }

    return {
        organization: org,
        role: membership.role,
        permissions: getOrgPermissions(membership.role),
    };
}
