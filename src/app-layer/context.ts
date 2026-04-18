import { NextRequest } from 'next/server';
import { getSessionOrThrow } from '@/lib/auth';
import { resolveTenantContext } from '@/lib/tenant-context';
import { RequestContext } from './types';
import { randomUUID } from 'crypto';
import { mergeRequestContext } from '@/lib/observability/context';
import {
    extractBearerToken,
    isApiKeyToken,
    verifyApiKey,
} from '@/lib/auth/api-key-auth';
import { unauthorized } from '@/lib/errors/types';

/**
 * Generates or extracts a request ID.
 * Future enhancement: Read from headers (x-request-id).
 */
function getRequestId(req?: NextRequest): string {
    if (req?.headers.has('x-request-id')) {
        return req.headers.get('x-request-id')!;
    }
    return randomUUID();
}

/**
 * Builds a RequestContext for tenant-level operations.
 * Requires tenantSlug from the route params.
 *
 * Custom role resolution: When the user's membership has a customRoleId,
 * appPermissions comes from the custom role's permissionsJson (parsed
 * with baseRole fallback). Otherwise, standard enum-based permissions.
 */
export async function getTenantCtx(
    params: { tenantSlug: string },
    req?: NextRequest
): Promise<RequestContext> {
    // Try API key auth first if Authorization header is present
    if (req) {
        const apiKeyCtx = await tryApiKeyAuth(req);
        if (apiKeyCtx) return apiKeyCtx;
    }

    const session = await getSessionOrThrow();
    const requestId = getRequestId(req);

    // This checks membership and resolves the tenant UUID & role
    const ctx = await resolveTenantContext(params, session.userId);

    // Enrich the observability context with tenant and user info
    // so that logs/traces emitted downstream automatically include them.
    mergeRequestContext({ tenantId: ctx.tenant.id, userId: session.userId });

    return {
        requestId,
        userId: session.userId,
        tenantId: ctx.tenant.id,
        tenantSlug: ctx.tenant.slug,
        role: ctx.role,
        permissions: ctx.permissions,
        appPermissions: ctx.appPermissions,
    };
}

/**
 * Builds a RequestContext for legacy API routes that don't have tenantSlug in params.
 * Resolves tenant from the session JWT's tenantId field.
 *
 * This also performs a membership check that legacy routes previously skipped.
 */
export async function getLegacyCtx(req?: NextRequest): Promise<RequestContext> {
    // Try API key auth first if Authorization header is present
    if (req) {
        const apiKeyCtx = await tryApiKeyAuth(req);
        if (apiKeyCtx) return apiKeyCtx;
    }

    const session = await getSessionOrThrow();
    const requestId = getRequestId(req);

    // Resolve tenant context from session's tenantId (verifies membership)
    const ctx = await resolveTenantContext({ tenantId: session.tenantId }, session.userId);

    // Enrich the observability context with tenant and user info
    mergeRequestContext({ tenantId: ctx.tenant.id, userId: session.userId });

    return {
        requestId,
        userId: session.userId,
        tenantId: ctx.tenant.id,
        tenantSlug: ctx.tenant.slug,
        role: ctx.role,
        permissions: ctx.permissions,
        appPermissions: ctx.appPermissions,
    };
}

// ─── API Key Auth Helper ───

/**
 * Attempt to authenticate via API key from the Authorization header.
 * Returns a RequestContext if the bearer token is an API key and verification succeeds.
 * Returns null if the token is not an API key (allowing session auth fallback).
 * Throws unauthorized() if the token IS an API key but is invalid.
 */
async function tryApiKeyAuth(req: NextRequest): Promise<RequestContext | null> {
    const authHeader = req.headers.get('authorization');
    const token = extractBearerToken(authHeader);

    // No token or not an API key format → fall through to session auth
    if (!token || !isApiKeyToken(token)) return null;

    // It IS an API key — must validate
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || null;

    const result = await verifyApiKey(token, clientIp);

    if (!result.valid) {
        throw unauthorized(`API key authentication failed: ${result.reason}`);
    }

    // Override requestId from the header if available
    const requestId = getRequestId(req);
    result.ctx.requestId = requestId;

    // Enrich observability context
    mergeRequestContext({
        tenantId: result.ctx.tenantId,
        userId: result.ctx.userId,
    });

    return result.ctx;
}

