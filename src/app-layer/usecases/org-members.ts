/**
 * Epic O-2 — organization member management.
 *
 * Two operations:
 *   1. `addOrgMember` — create OrgMembership; if role=ORG_ADMIN, fan
 *      out AUDITOR memberships into every child tenant.
 *   2. `removeOrgMember` — fan in the deprovision (delete only auto-
 *      provisioned rows), then delete the OrgMembership. Manually-
 *      granted tenant memberships survive.
 *
 * Both operations are idempotent (the underlying provisioning service
 * is) and run on the global Prisma client. Callers must have passed
 * `canManageMembers` at the route layer; this usecase doesn't re-
 * derive the permission.
 *
 * ## Last-ORG_ADMIN guard
 *
 * Removing the last ORG_ADMIN of an org would orphan it (no one left
 * to manage tenants/members). Mirrors the spirit of Epic 1's
 * `tenant_membership_last_owner_guard` — but at the usecase layer
 * only, no DB trigger. A future iteration can add a trigger if cross-
 * code-path safety becomes a concern.
 */

import prisma from '@/lib/prisma';
import {
    provisionOrgAdminToTenants,
    deprovisionOrgAdmin,
    type ProvisionResult,
    type DeprovisionResult,
} from './org-provisioning';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors/types';
import type { OrgContext } from '@/app-layer/types';
import type { OrgRole } from '@prisma/client';
import { logger } from '@/lib/observability/logger';

// ── addOrgMember ──────────────────────────────────────────────────────

export interface AddOrgMemberInput {
    /** Target user — looked up by email. Created as a placeholder if
     *  no user row matches yet. */
    userEmail: string;
    role: OrgRole;
}

export interface AddOrgMemberResult {
    membership: {
        id: string;
        organizationId: string;
        userId: string;
        role: OrgRole;
    };
    user: { id: string; email: string };
    /** Provisioning fan-out result, populated only when role === ORG_ADMIN. */
    provision?: ProvisionResult;
}

export async function addOrgMember(
    ctx: OrgContext,
    input: AddOrgMemberInput,
): Promise<AddOrgMemberResult> {
    const email = input.userEmail.trim().toLowerCase();
    if (!email) {
        throw new ValidationError('userEmail is required');
    }

    // Find-or-create the User row. Mirrors `createTenantWithOwner` —
    // a placeholder lets an admin add a member by email before that
    // user has signed in for the first time.
    const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: { email },
        select: { id: true, email: true },
    });

    // Fail loud if the user is already a member rather than silently
    // accepting an idempotent overwrite. Role changes need a separate
    // flow (out of scope here) to avoid surprising re-provisioning.
    const existing = await prisma.orgMembership.findUnique({
        where: {
            organizationId_userId: {
                organizationId: ctx.organizationId,
                userId: user.id,
            },
        },
        select: { role: true },
    });
    if (existing) {
        throw new ConflictError(
            `User is already a member of this organization (role=${existing.role})`,
        );
    }

    const membership = await prisma.orgMembership.create({
        data: {
            organizationId: ctx.organizationId,
            userId: user.id,
            role: input.role,
        },
        select: {
            id: true,
            organizationId: true,
            userId: true,
            role: true,
        },
    });

    let provision: ProvisionResult | undefined;
    if (input.role === 'ORG_ADMIN') {
        provision = await provisionOrgAdminToTenants(
            ctx.organizationId,
            user.id,
        );
    }

    logger.info('org-members.added', {
        component: 'org-members',
        organizationId: ctx.organizationId,
        userId: user.id,
        role: input.role,
        provisionedTenants: provision?.created ?? 0,
        requestId: ctx.requestId,
    });

    return {
        membership,
        user: { id: user.id, email: user.email },
        provision,
    };
}

// ── removeOrgMember ───────────────────────────────────────────────────

export interface RemoveOrgMemberInput {
    /** Target user id. Email lookup is the caller's responsibility — a
     *  user with a stale email in the UI shouldn't accidentally remove
     *  someone else. */
    userId: string;
}

export interface RemoveOrgMemberResult {
    deletedMembershipId: string;
    /** Was the removed member an ORG_ADMIN? */
    wasOrgAdmin: boolean;
    /** Deprovision fan-in result, populated only when wasOrgAdmin. */
    deprovision?: DeprovisionResult;
}

export async function removeOrgMember(
    ctx: OrgContext,
    input: RemoveOrgMemberInput,
): Promise<RemoveOrgMemberResult> {
    const userId = input.userId?.trim();
    if (!userId) {
        throw new ValidationError('userId is required');
    }

    const membership = await prisma.orgMembership.findUnique({
        where: {
            organizationId_userId: {
                organizationId: ctx.organizationId,
                userId,
            },
        },
        select: { id: true, role: true },
    });
    if (!membership) {
        throw new NotFoundError('Org membership not found');
    }

    // Last-ORG_ADMIN guard. If the target is the only remaining
    // ORG_ADMIN, refuse the removal — orphaning the org breaks
    // tenant/member management.
    if (membership.role === 'ORG_ADMIN') {
        const adminCount = await prisma.orgMembership.count({
            where: {
                organizationId: ctx.organizationId,
                role: 'ORG_ADMIN',
            },
        });
        if (adminCount <= 1) {
            throw new ConflictError(
                'Cannot remove the last ORG_ADMIN of an organization. ' +
                    'Promote another member to ORG_ADMIN first, or delete the ' +
                    'organization.',
            );
        }
    }

    let deprovision: DeprovisionResult | undefined;
    if (membership.role === 'ORG_ADMIN') {
        // Fan-in BEFORE deleting the OrgMembership so the user's
        // tenant-side AUDITOR rows are gone before they lose
        // org-admin status. The order doesn't change correctness —
        // both operations are idempotent — but it preserves the
        // logical sequence for any concurrent observer.
        deprovision = await deprovisionOrgAdmin(ctx.organizationId, userId);
    }

    await prisma.orgMembership.delete({
        where: { id: membership.id },
    });

    logger.info('org-members.removed', {
        component: 'org-members',
        organizationId: ctx.organizationId,
        userId,
        wasOrgAdmin: membership.role === 'ORG_ADMIN',
        deprovisionedTenants: deprovision?.deleted ?? 0,
        requestId: ctx.requestId,
    });

    return {
        deletedMembershipId: membership.id,
        wasOrgAdmin: membership.role === 'ORG_ADMIN',
        deprovision,
    };
}
