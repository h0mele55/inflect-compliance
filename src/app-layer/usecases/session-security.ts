/**
 * Session Security Usecases
 *
 * Session revocation for JWT-based sessions:
 * - revokeUserSessions: increment sessionVersion for a target user (ADMIN or self)
 * - revokeCurrentSession: increment own sessionVersion
 * - revokeAllTenantSessions: bulk increment for all tenant members (ADMIN-only)
 * - getUserSessionVersion: read current sessionVersion (for JWT callback)
 *
 * DESIGN: Since sessions are JWT (stateless), revocation works by incrementing
 * a `sessionVersion` counter on the User model. The auth.ts JWT callback checks
 * this on every request and forces reauth if the token's version is stale.
 */
import { prisma } from '@/lib/prisma';
import type { RequestContext } from '../types';
import { forbidden, notFound } from '@/lib/errors/types';
import { logEvent } from '../events/audit';

// ─── Types ──────────────────────────────────────────────────────────

export interface SessionRevocationResult {
    userId: string;
    newSessionVersion: number;
}

export interface BulkRevocationResult {
    usersAffected: number;
}

// ─── Revoke User Sessions ───────────────────────────────────────────

/**
 * Revokes all sessions for a target user by incrementing their sessionVersion.
 * - Self: always allowed
 * - Other user: ADMIN-only, and target must be in the same tenant
 */
export async function revokeUserSessions(
    ctx: RequestContext,
    targetUserId?: string,
): Promise<SessionRevocationResult> {
    const effectiveUserId = targetUserId || ctx.userId;

    // Non-admins can only revoke their own sessions
    if (effectiveUserId !== ctx.userId) {
        if (!ctx.permissions.canAdmin) {
            throw forbidden('Only admins can revoke other users\' sessions');
        }

        // Verify target user is in the same tenant
        const membership = await prisma.tenantMembership.findUnique({
            where: {
                tenantId_userId: {
                    tenantId: ctx.tenantId,
                    userId: effectiveUserId,
                },
            },
        });

        if (!membership) {
            throw notFound('Target user is not a member of this tenant');
        }
    }

    const updated = await prisma.user.update({
        where: { id: effectiveUserId },
        data: { sessionVersion: { increment: 1 } },
        select: { id: true, sessionVersion: true },
    });

    // Audit
    const action = effectiveUserId === ctx.userId ? 'CURRENT_SESSION_REVOKED' : 'SESSIONS_REVOKED_FOR_USER';
    try {
        await logEvent(prisma, ctx, {
            action,
            entityType: 'User',
            entityId: effectiveUserId,
            details: `Sessions revoked. New sessionVersion: ${updated.sessionVersion}`,
            detailsJson: { category: 'custom', event: 'unknown' },
        });
    } catch { /* audit is best-effort */ }

    return {
        userId: updated.id,
        newSessionVersion: updated.sessionVersion,
    };
}

// ─── Revoke Current Session ─────────────────────────────────────────

/**
 * Convenience: revokes the current user's own sessions.
 */
export async function revokeCurrentSession(
    ctx: RequestContext,
): Promise<SessionRevocationResult> {
    return revokeUserSessions(ctx, ctx.userId);
}

// ─── Revoke All Tenant Sessions ─────────────────────────────────────

/**
 * Revokes sessions for ALL members of the current tenant.
 * ADMIN-only. Useful after a security incident.
 */
export async function revokeAllTenantSessions(
    ctx: RequestContext,
): Promise<BulkRevocationResult> {
    if (!ctx.permissions.canAdmin) {
        throw forbidden('Only admins can revoke all tenant sessions');
    }

    // Get all user IDs in this tenant
    const memberships = await prisma.tenantMembership.findMany({
        where: { tenantId: ctx.tenantId },
        select: { userId: true },
    });

    const userIds = memberships.map((m) => m.userId);

    if (userIds.length === 0) {
        return { usersAffected: 0 };
    }

    // Bulk increment sessionVersion for all tenant members
    const result = await prisma.user.updateMany({
        where: { id: { in: userIds } },
        data: { sessionVersion: { increment: 1 } },
    });

    // Audit
    try {
        await logEvent(prisma, ctx, {
            action: 'ALL_TENANT_SESSIONS_REVOKED',
            entityType: 'Tenant',
            entityId: ctx.tenantId,
            details: `Revoked sessions for ${result.count} users.`,
            detailsJson: { category: 'access', operation: 'all_tenant_sessions_revoked', detail: 'ALL_TENANT_SESSIONS_REVOKED' },
        });
    } catch { /* audit is best-effort */ }

    return { usersAffected: result.count };
}

// ─── Revoke Other Sessions (preserve current) ───────────────────────

/**
 * Variant of {@link revokeUserSessions} used by the authenticated
 * password-change flow. Bumps `sessionVersion` so every JWT pegged to
 * the prior version is force-invalidated, then explicitly revokes every
 * `UserSession` row for this user EXCEPT the one identified by
 * `currentUserSessionId` — that row is kept active and its associated
 * device stays signed in.
 *
 * UX rationale: forcing logout on the device the user just used to
 * change their password adds friction without a security upside (the
 * same user already proved possession of the current password ~2s
 * earlier). Other devices ARE revoked because a current-password
 * compromise might have produced sessions elsewhere.
 *
 * Note: bumping `sessionVersion` would normally invalidate the current
 * JWT too on the next request. The caller is responsible for issuing
 * a fresh cookie (or letting NextAuth's JWT callback refresh on next
 * touch). Without that step, the user's next request still 401s.
 */
export async function revokeOtherUserSessions(
    ctx: RequestContext,
    currentUserSessionId: string | null | undefined,
): Promise<SessionRevocationResult> {
    const updated = await prisma.user.update({
        where: { id: ctx.userId },
        data: { sessionVersion: { increment: 1 } },
        select: { id: true, sessionVersion: true },
    });

    if (currentUserSessionId) {
        // Mark every OTHER row revoked. We don't fail the path if this
        // errors — the sessionVersion bump is the load-bearing kill
        // switch; per-row revocation is for clean audit-trail granularity.
        try {
            await prisma.userSession.updateMany({
                where: {
                    userId: ctx.userId,
                    revokedAt: null,
                    NOT: { id: currentUserSessionId },
                },
                data: {
                    revokedAt: new Date(),
                    revokedReason: 'password-changed',
                },
            });
        } catch { /* best-effort */ }
    } else {
        // No current session id resolved (e.g. cookie-only legacy path).
        // Fall back to revoking everything; caller will re-auth on next
        // request.
        try {
            await prisma.userSession.updateMany({
                where: { userId: ctx.userId, revokedAt: null },
                data: {
                    revokedAt: new Date(),
                    revokedReason: 'password-changed',
                },
            });
        } catch { /* best-effort */ }
    }

    try {
        await logEvent(prisma, ctx, {
            action: 'OTHER_SESSIONS_REVOKED_PASSWORD_CHANGE',
            entityType: 'User',
            entityId: ctx.userId,
            details: `Other sessions revoked on password change. New sessionVersion: ${updated.sessionVersion}`,
            detailsJson: { category: 'access', operation: 'session_revoked', detail: 'password-changed' },
        });
    } catch { /* audit best-effort */ }

    return {
        userId: updated.id,
        newSessionVersion: updated.sessionVersion,
    };
}

// ─── Get Session Version ────────────────────────────────────────────

/**
 * Returns the current sessionVersion for a user.
 * Used by the auth.ts JWT callback to check for forced reauth.
 */
export async function getUserSessionVersion(
    userId: string,
): Promise<number> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { sessionVersion: true },
    });

    return user?.sessionVersion ?? 0;
}
