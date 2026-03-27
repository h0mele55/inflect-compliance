/**
 * Server-side admin authorization guards for API routes.
 *
 * These are drop-in replacements for `getTenantCtx()` that additionally
 * enforce role-based access control. They throw `AppError(403)` which is
 * caught by `withApiErrorHandling` and returned as a JSON 403 response.
 *
 * Usage in an admin API route:
 *
 *   import { requireAdminCtx } from '@/lib/auth/require-admin';
 *
 *   export const POST = withApiErrorHandling(async (req, { params }) => {
 *       const ctx = await requireAdminCtx(params, req);
 *       // ... admin-only logic
 *   });
 *
 * Defence-in-depth layers:
 *   1. Edge middleware — redirects non-admin from /admin paths
 *   2. Admin layout guard — client-side RequirePermission
 *   3. This utility — server-side 403 enforcement on API routes
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { forbidden } from '@/lib/errors/types';
import type { RequestContext } from '@/app-layer/types';
import type { Role } from '@prisma/client';

/**
 * Role hierarchy for comparison.
 * AUDITOR is a sidecar role (not in the linear ADMIN > EDITOR > READER chain).
 */
const ROLE_LEVEL: Record<Role, number> = {
    ADMIN: 4,
    EDITOR: 3,
    AUDITOR: 2,
    READER: 1,
};

/**
 * Resolve tenant context and enforce ADMIN role.
 *
 * Drop-in replacement for `getTenantCtx(params, req)`.
 * Throws 403 Forbidden (AppError) if the authenticated user is not an ADMIN
 * on the resolved tenant. The error is caught by `withApiErrorHandling`.
 *
 * @param params - Route params containing `tenantSlug`
 * @param req - The incoming NextRequest (for request ID extraction)
 * @returns RequestContext — guaranteed to have `role === 'ADMIN'`
 * @throws AppError(403) if non-admin
 * @throws AppError(401) if not authenticated
 * @throws AppError(404) if tenant not found
 * @throws AppError(403) if not a member of the tenant
 */
export async function requireAdminCtx(
    params: { tenantSlug: string },
    req?: NextRequest
): Promise<RequestContext> {
    const ctx = await getTenantCtx(params, req);

    if (ctx.role !== 'ADMIN') {
        throw forbidden('Admin access required');
    }

    return ctx;
}

/**
 * Resolve tenant context and enforce minimum EDITOR role (write access).
 *
 * Use this for routes that require write permissions but are not admin-only.
 * Throws 403 if the user's role is below EDITOR (i.e., READER or AUDITOR).
 *
 * @param params - Route params containing `tenantSlug`
 * @param req - The incoming NextRequest
 * @returns RequestContext — guaranteed to have role >= EDITOR
 * @throws AppError(403) if insufficient role
 */
export async function requireWriteCtx(
    params: { tenantSlug: string },
    req?: NextRequest
): Promise<RequestContext> {
    const ctx = await getTenantCtx(params, req);

    if (ROLE_LEVEL[ctx.role] < ROLE_LEVEL['EDITOR']) {
        throw forbidden('Write access required');
    }

    return ctx;
}

/**
 * Resolve tenant context and enforce a minimum role.
 *
 * Generic version — use `requireAdminCtx` or `requireWriteCtx` for clarity.
 *
 * @param params - Route params containing `tenantSlug`
 * @param minRole - The minimum required role
 * @param req - The incoming NextRequest
 * @returns RequestContext — guaranteed to have role >= minRole
 * @throws AppError(403) if insufficient role
 */
export async function requireRoleCtx(
    params: { tenantSlug: string },
    minRole: Role,
    req?: NextRequest
): Promise<RequestContext> {
    const ctx = await getTenantCtx(params, req);

    if (ROLE_LEVEL[ctx.role] < ROLE_LEVEL[minRole]) {
        throw forbidden(`${minRole} access required`);
    }

    return ctx;
}
