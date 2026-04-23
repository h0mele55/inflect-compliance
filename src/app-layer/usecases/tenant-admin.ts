/**
 * Tenant Admin Usecases — Member Management & Settings
 *
 * Core admin functions for Epic 12: Admin UI & RBAC Management.
 * All mutations require ADMIN role, enforced server-side via policies.
 *
 * Safety invariants:
 *   - Cannot demote yourself (last-admin protection)
 *   - Cannot deactivate yourself
 *   - Cannot assign a role higher than ADMIN (only ADMIN exists above EDITOR)
 *
 * @module usecases/tenant-admin
 */
import { RequestContext } from '../types';
import {
    assertCanManageMembers,
    assertCanChangeRoles,
    assertCanViewAdminSettings,
    assertNotSelfDemotion,
    assertNotSelfDeactivation,
} from '../policies/admin.policies';
import { logEvent } from '../events/audit';
import { runInTenantContext } from '@/lib/db-context';
import { notFound, badRequest, forbidden } from '@/lib/errors/types';
import { randomBytes } from 'crypto';
import type { Role } from '@prisma/client';

// ─── Valid roles for assignment ───
const VALID_ROLES: Role[] = ['ADMIN', 'EDITOR', 'AUDITOR', 'READER'];

// ─── List Members ───

export async function listTenantMembers(ctx: RequestContext) {
    assertCanViewAdminSettings(ctx);
    const memberships = await runInTenantContext(ctx, (db) =>
        db.tenantMembership.findMany({
            where: {
                tenantId: ctx.tenantId,
                status: { in: ['ACTIVE', 'INVITED', 'DEACTIVATED'] },
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        image: true,
                        createdAt: true,
                    },
                },
                invitedBy: {
                    select: { id: true, name: true },
                },
                customRole: {
                    select: { id: true, name: true },
                },
            },
            orderBy: { createdAt: 'asc' },
        })
    );

    // Epic C.3 — attach live-session counts so the admin members UI
    // can surface "3 active sessions" without an N+1 cascade of
    // requests. Best-effort: a DB failure falls back to 0 counts and
    // the UI degrades gracefully rather than failing the whole page.
    let counts: Record<string, number> = {};
    try {
        const { countActiveSessionsForTenantUsers } = await import(
            '@/lib/security/session-tracker'
        );
        counts = await countActiveSessionsForTenantUsers(ctx.tenantId);
    } catch {
        counts = {};
    }
    return memberships.map((m) => ({
        ...m,
        activeSessionCount: counts[m.userId] ?? 0,
    }));
}

// ─── Invite Member ───

export async function inviteTenantMember(
    ctx: RequestContext,
    input: { email: string; role: Role }
) {
    assertCanManageMembers(ctx);

    if (!VALID_ROLES.includes(input.role)) {
        throw badRequest(`Invalid role: ${input.role}`);
    }

    return runInTenantContext(ctx, async (db) => {
        // Check if user already exists with this email
        const existingUser = await db.user.findUnique({
            where: { email: input.email.toLowerCase().trim() },
        });

        if (existingUser) {
            // Check for existing membership
            const existingMembership = await db.tenantMembership.findUnique({
                where: {
                    tenantId_userId: {
                        tenantId: ctx.tenantId,
                        userId: existingUser.id,
                    },
                },
            });

            if (existingMembership) {
                if (existingMembership.status === 'ACTIVE') {
                    throw badRequest('User is already an active member of this tenant.');
                }
                if (existingMembership.status === 'DEACTIVATED') {
                    // Reactivate
                    const reactivated = await db.tenantMembership.update({
                        where: { id: existingMembership.id },
                        data: {
                            status: 'ACTIVE',
                            role: input.role,
                            deactivatedAt: null,
                            invitedByUserId: ctx.userId,
                            invitedAt: new Date(),
                        },
                        include: { user: { select: { id: true, name: true, email: true } } },
                    });

                    await logEvent(db, ctx, {
                        action: 'MEMBER_REACTIVATED',
                        entityType: 'TenantMembership',
                        entityId: reactivated.id,
                        details: `Reactivated member: ${input.email} as ${input.role}`,
                        detailsJson: {
                            category: 'entity_lifecycle',
                            entityName: 'TenantMembership',
                            operation: 'updated',
                            changedFields: ['status', 'role'],
                            after: { status: 'ACTIVE', role: input.role },
                            summary: `Reactivated member: ${input.email}`,
                        },
                    });

                    return { type: 'reactivated' as const, membership: reactivated };
                }
            }

            // Create new membership for existing user
            const membership = await db.tenantMembership.create({
                data: {
                    tenantId: ctx.tenantId,
                    userId: existingUser.id,
                    role: input.role,
                    status: 'ACTIVE',
                    invitedByUserId: ctx.userId,
                    invitedAt: new Date(),
                },
                include: { user: { select: { id: true, name: true, email: true } } },
            });

            await logEvent(db, ctx, {
                action: 'MEMBER_ADDED',
                entityType: 'TenantMembership',
                entityId: membership.id,
                details: `Added member: ${input.email} as ${input.role}`,
                detailsJson: {
                    category: 'entity_lifecycle',
                    entityName: 'TenantMembership',
                    operation: 'created',
                    after: { email: input.email, role: input.role, status: 'ACTIVE' },
                    summary: `Added member: ${input.email} as ${input.role}`,
                },
            });

            return { type: 'added' as const, membership };
        }

        // User doesn't exist — create invite token
        const token = randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        // Upsert invite (replace existing pending invite for same email)
        const invite = await db.tenantInvite.upsert({
            where: {
                tenantId_email: {
                    tenantId: ctx.tenantId,
                    email: input.email.toLowerCase().trim(),
                },
            },
            create: {
                tenantId: ctx.tenantId,
                email: input.email.toLowerCase().trim(),
                role: input.role,
                token,
                invitedById: ctx.userId,
                expiresAt,
            },
            update: {
                role: input.role,
                token,
                invitedById: ctx.userId,
                expiresAt,
                revokedAt: null,
                acceptedAt: null,
            },
        });

        await logEvent(db, ctx, {
            action: 'MEMBER_INVITED',
            entityType: 'TenantInvite',
            entityId: invite.id,
            details: `Invited ${input.email} as ${input.role}`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'TenantInvite',
                operation: 'created',
                after: { email: input.email, role: input.role, expiresAt: expiresAt.toISOString() },
                summary: `Invited ${input.email} as ${input.role}`,
            },
        });

        return { type: 'invited' as const, invite };
    });
}

// ─── Update Member Role ───

export async function updateTenantMemberRole(
    ctx: RequestContext,
    input: { membershipId: string; role: Role }
) {
    assertCanChangeRoles(ctx);

    if (!VALID_ROLES.includes(input.role)) {
        throw badRequest(`Invalid role: ${input.role}`);
    }

    return runInTenantContext(ctx, async (db) => {
        const membership = await db.tenantMembership.findFirst({
            where: {
                id: input.membershipId,
                tenantId: ctx.tenantId,
                status: 'ACTIVE',
            },
            include: { user: { select: { id: true, name: true, email: true } } },
        });

        if (!membership) {
            throw notFound('Membership not found or not active.');
        }

        // Safety: prevent self-demotion
        assertNotSelfDemotion(ctx, membership.userId, input.role);

        // Safety: last-admin protection
        if (membership.role === 'ADMIN' && input.role !== 'ADMIN') {
            const adminCount = await db.tenantMembership.count({
                where: {
                    tenantId: ctx.tenantId,
                    role: 'ADMIN',
                    status: 'ACTIVE',
                },
            });
            if (adminCount <= 1) {
                throw forbidden('Cannot remove the last admin. Promote another member first.');
            }
        }

        const oldRole = membership.role;

        const updated = await db.tenantMembership.update({
            where: { id: input.membershipId },
            data: { role: input.role },
            include: { user: { select: { id: true, name: true, email: true } } },
        });

        await logEvent(db, ctx, {
            action: 'MEMBER_ROLE_CHANGED',
            entityType: 'TenantMembership',
            entityId: updated.id,
            details: `Role changed: ${oldRole} → ${input.role} for ${membership.user.email}`,
            detailsJson: {
                category: 'status_change',
                entityName: 'TenantMembership',
                fromStatus: oldRole,
                toStatus: input.role,
            },
        });

        return updated;
    });
}

// ─── Deactivate Member ───

export async function deactivateTenantMember(
    ctx: RequestContext,
    input: { membershipId: string }
) {
    assertCanManageMembers(ctx);

    return runInTenantContext(ctx, async (db) => {
        const membership = await db.tenantMembership.findFirst({
            where: {
                id: input.membershipId,
                tenantId: ctx.tenantId,
                status: 'ACTIVE',
            },
            include: { user: { select: { id: true, name: true, email: true } } },
        });

        if (!membership) {
            throw notFound('Membership not found or not active.');
        }

        // Safety: prevent self-deactivation
        assertNotSelfDeactivation(ctx, membership.userId);

        // Safety: last-admin protection
        if (membership.role === 'ADMIN') {
            const adminCount = await db.tenantMembership.count({
                where: {
                    tenantId: ctx.tenantId,
                    role: 'ADMIN',
                    status: 'ACTIVE',
                },
            });
            if (adminCount <= 1) {
                throw forbidden('Cannot deactivate the last admin.');
            }
        }

        const deactivated = await db.tenantMembership.update({
            where: { id: input.membershipId },
            data: {
                status: 'DEACTIVATED',
                deactivatedAt: new Date(),
            },
            include: { user: { select: { id: true, name: true, email: true } } },
        });

        await logEvent(db, ctx, {
            action: 'MEMBER_DEACTIVATED',
            entityType: 'TenantMembership',
            entityId: deactivated.id,
            details: `Deactivated member: ${membership.user.email}`,
            detailsJson: {
                category: 'status_change',
                entityName: 'TenantMembership',
                fromStatus: 'ACTIVE',
                toStatus: 'DEACTIVATED',
            },
        });

        return deactivated;
    });
}

// ─── Tenant Admin Settings ───

export async function getTenantAdminSettings(ctx: RequestContext) {
    assertCanViewAdminSettings(ctx);

    return runInTenantContext(ctx, async (db) => {
        const [tenant, memberCounts, pendingInvites, identityProviders, securitySettings] =
            await Promise.all([
                db.tenant.findUnique({
                    where: { id: ctx.tenantId },
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        industry: true,
                        createdAt: true,
                    },
                }),
                db.tenantMembership.groupBy({
                    by: ['status'],
                    where: { tenantId: ctx.tenantId },
                    _count: { id: true },
                }),
                db.tenantInvite.count({
                    where: {
                        tenantId: ctx.tenantId,
                        acceptedAt: null,
                        revokedAt: null,
                        expiresAt: { gt: new Date() },
                    },
                }),
                db.tenantIdentityProvider.findMany({
                    where: { tenantId: ctx.tenantId },
                    select: {
                        id: true,
                        name: true,
                        type: true,
                        isEnabled: true,
                        isEnforced: true,
                    },
                }),
                db.tenantSecuritySettings.findUnique({
                    where: { tenantId: ctx.tenantId },
                    select: {
                        mfaPolicy: true,
                        sessionMaxAgeMinutes: true,
                    },
                }),
            ]);

        const statusCounts: Record<string, number> = {};
        for (const g of memberCounts) {
            statusCounts[g.status] = g._count.id;
        }

        return {
            tenant,
            members: {
                active: statusCounts['ACTIVE'] ?? 0,
                invited: statusCounts['INVITED'] ?? 0,
                deactivated: statusCounts['DEACTIVATED'] ?? 0,
                total: Object.values(statusCounts).reduce((a, b) => a + b, 0),
            },
            pendingInvites,
            identityProviders,
            security: securitySettings ?? { mfaPolicy: 'DISABLED', sessionMaxAgeMinutes: null },
        };
    });
}

// ─── List Pending Invites ───

export async function listPendingInvites(ctx: RequestContext) {
    assertCanViewAdminSettings(ctx);

    return runInTenantContext(ctx, (db) =>
        db.tenantInvite.findMany({
            where: {
                tenantId: ctx.tenantId,
                acceptedAt: null,
                revokedAt: null,
                expiresAt: { gt: new Date() },
            },
            include: {
                invitedBy: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        })
    );
}

// ─── Revoke Invite ───

export async function revokeInvite(ctx: RequestContext, inviteId: string) {
    assertCanManageMembers(ctx);

    return runInTenantContext(ctx, async (db) => {
        const invite = await db.tenantInvite.findFirst({
            where: {
                id: inviteId,
                tenantId: ctx.tenantId,
                acceptedAt: null,
                revokedAt: null,
            },
        });

        if (!invite) throw notFound('Invite not found or already accepted/revoked.');

        const revoked = await db.tenantInvite.update({
            where: { id: inviteId },
            data: { revokedAt: new Date() },
        });

        await logEvent(db, ctx, {
            action: 'INVITE_REVOKED',
            entityType: 'TenantInvite',
            entityId: revoked.id,
            details: `Revoked invite for ${invite.email}`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'TenantInvite',
                operation: 'deleted',
                summary: `Revoked invite for ${invite.email}`,
            },
        });

        return revoked;
    });
}
