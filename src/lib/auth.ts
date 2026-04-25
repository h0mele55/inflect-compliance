/**
 * Auth utilities for Inflect Compliance.
 *
 * This module bridges Auth.js v5 sessions to the existing API route
 * interface (getSession, getSessionOrThrow, requireRole, etc.).
 *
 * Role hierarchy (Chunk 1):
 *   ADMIN > EDITOR > READER
 *   AUDITOR is a special role with read-only + audit access.
 *
 * TenantMembership is now authoritative for role assignment.
 * User.role and User.tenantId are deprecated backward-compat fields.
 */
import { auth } from '@/auth';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import prisma from './prisma';
import type { Role, User } from '@prisma/client';
import { env } from '@/env';
import { unauthorized, forbidden } from '@/lib/errors/types';

export interface JwtPayload {
    userId: string;
    tenantId: string;
    email: string;
    role: Role;
}

// Legacy JWT secret — used only for reading old cookies during migration
const LEGACY_JWT_SECRET = env.JWT_SECRET;

/**
 * Get the current session by:
 * 1. Trying Auth.js session first
 * 2. Falling back to legacy JWT cookie for migration
 *
 * tenantId and role are resolved from TenantMembership (default membership).
 */
export async function getSession(): Promise<JwtPayload | null> {
    // 1. Try Auth.js session
    const session = await auth();
    if (session?.user) {
        return {
            userId: session.user.id,
            tenantId: session.user.tenantId ?? '',
            email: session.user.email ?? '',
            role: session.user.role ?? 'READER',
        };
    }

    // 2. Legacy fallback: check for old 'token' cookie
    if (LEGACY_JWT_SECRET) {
        try {
            const cookieStore = await cookies();
            const legacyToken = cookieStore.get('token')?.value;
            if (legacyToken) {
                const decoded = jwt.verify(legacyToken, LEGACY_JWT_SECRET) as {
                    userId: string;
                    tenantId: string;
                    email: string;
                    role: Role;
                };
                return {
                    userId: decoded.userId,
                    tenantId: decoded.tenantId,
                    email: decoded.email,
                    role: decoded.role,
                };
            }
        } catch {
            // Legacy token invalid — ignore
        }
    }

    return null;
}

export async function getSessionOrThrow(): Promise<JwtPayload> {
    const session = await getSession();
    if (!session) throw unauthorized();
    return session;
}

export async function getCurrentUser(): Promise<User | null> {
    const session = await getSession();
    if (!session) return null;
    return prisma.user.findUnique({ where: { id: session.userId } });
}

// ─── RBAC helpers (Chunk 1: unified roles) ───

/**
 * Linear hierarchy for standard roles.
 * AUDITOR is sidecar — not in the linear chain.
 */
const ROLE_HIERARCHY: Record<Role, number> = {
    OWNER: 5,
    ADMIN: 4,
    EDITOR: 3,
    AUDITOR: 2,
    READER: 1,
};

export function hasMinRole(userRole: Role, minRole: Role): boolean {
    return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole];
}

// ─── Permission-based helpers ───

/** Can read tenant/scope data (all roles) */
export function canRead(role: Role): boolean {
    return ['ADMIN', 'EDITOR', 'READER', 'AUDITOR'].includes(role);
}

/** Can write/mutate data (ADMIN, EDITOR) */
export function canWrite(role: Role): boolean {
    return ['ADMIN', 'EDITOR'].includes(role);
}

/** Can perform admin operations (ADMIN only) */
export function canAdmin(role: Role): boolean {
    return role === 'ADMIN';
}

/** Can perform audit-specific operations (AUDITOR, ADMIN) */
export function canAudit(role: Role): boolean {
    return ['ADMIN', 'AUDITOR'].includes(role);
}

/** Can export data (ADMIN, EDITOR, AUDITOR) */
export function canExport(role: Role): boolean {
    return ['ADMIN', 'EDITOR', 'AUDITOR'].includes(role);
}

/** Can edit data — alias for canWrite for backward compat */
export function canEdit(role: Role): boolean {
    return canWrite(role);
}

export function requireRole(session: JwtPayload, minRole: Role): void {
    if (!hasMinRole(session.role, minRole)) {
        throw forbidden('Forbidden: insufficient permissions');
    }
}

// ─── Membership-based role checks ───

/**
 * Check if a user has a specific role (or higher) on a tenant.
 * Resolves from TenantMembership table.
 */
export async function hasTenantRole(
    userId: string,
    tenantId: string,
    requiredRole: Role
): Promise<boolean> {
    const membership = await prisma.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId, userId } },
    });
    if (!membership) return false;
    return hasMinRole(membership.role, requiredRole);
}

// ─── Legacy helpers kept for backward compatibility ───

// Same ESM/CJS interop normalisation as src/lib/auth/passwords.ts.
// Without it, Node ≥ 22 returns the namespace with bcryptjs's exports
// under `.default`, and `bcrypt.compare` is undefined.
async function loadBcrypt(): Promise<typeof import('bcryptjs')> {
    const m = await import('bcryptjs');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ns: any = m;
    return (ns.default ?? ns) as typeof import('bcryptjs');
}

export async function hashPassword(password: string): Promise<string> {
    const bcrypt = await loadBcrypt();
    return bcrypt.hash(password, 12);
}

export async function verifyPassword(
    password: string,
    hash: string
): Promise<boolean> {
    const bcrypt = await loadBcrypt();
    return bcrypt.compare(password, hash);
}

export function signToken(payload: JwtPayload): string {
    if (!LEGACY_JWT_SECRET) {
        throw new Error('JWT_SECRET not set — legacy token signing disabled');
    }
    return jwt.sign(payload, LEGACY_JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload | null {
    if (!LEGACY_JWT_SECRET) return null;
    try {
        return jwt.verify(token, LEGACY_JWT_SECRET) as JwtPayload;
    } catch {
        return null;
    }
}
