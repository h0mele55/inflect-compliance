import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import {
    getTenantSsoConfig,
    upsertTenantSsoConfig,
    deleteTenantSsoConfig,
    toggleTenantSso,
    setTenantSsoEnforced,
} from '@/app-layer/usecases/sso';
import { UpsertSsoConfigInput } from '@/app-layer/schemas/sso-config.schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

/**
 * Tenant-scoped SSO configuration routes.
 *
 * These routes use getTenantCtx (slug-based tenant resolution)
 * instead of getLegacyCtx (session-based). This aligns with the
 * /api/t/[tenantSlug]/* pattern used by the admin UI pages.
 *
 * All mutations require ADMIN role, enforced in the SSO usecases.
 */

/**
 * GET /api/t/[tenantSlug]/sso — list SSO providers (ADMIN only)
 */
export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const providers = await getTenantSsoConfig(ctx);
    // Strip secrets from configJson before sending to client
    const safe = providers.map((p) => ({
        ...p,
        configJson: maskSecrets(p.configJson as Record<string, unknown>),
    }));
    return NextResponse.json(safe);
});

/**
 * POST /api/t/[tenantSlug]/sso — create or update SSO provider (ADMIN only)
 */
export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const body = await req.json();
    const parsed = UpsertSsoConfigInput.parse(body);
    const provider = await upsertTenantSsoConfig(ctx, parsed);
    return NextResponse.json(provider, { status: body.id ? 200 : 201 });
});

/**
 * PATCH /api/t/[tenantSlug]/sso — toggle enable/enforce (ADMIN only)
 * Body: { id: string, action: 'enable' | 'disable' | 'enforce' | 'unenforce' }
 */
export const PATCH = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const { id, action } = await req.json() as { id: string; action: string };

    let result;
    switch (action) {
        case 'enable':
            result = await toggleTenantSso(ctx, id, true);
            break;
        case 'disable':
            result = await toggleTenantSso(ctx, id, false);
            break;
        case 'enforce':
            result = await setTenantSsoEnforced(ctx, id, true);
            break;
        case 'unenforce':
            result = await setTenantSsoEnforced(ctx, id, false);
            break;
        default:
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    return NextResponse.json(result);
});

/**
 * DELETE /api/t/[tenantSlug]/sso — delete SSO provider (ADMIN only)
 * Body: { id: string }
 */
export const DELETE = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const { id } = await req.json() as { id: string };
    await deleteTenantSsoConfig(ctx, id);
    return NextResponse.json({ ok: true });
});

// ─── Helpers ─────────────────────────────────────────────────────────

function maskSecrets(config: Record<string, unknown>): Record<string, unknown> {
    const masked = { ...config };
    const secretKeys = ['clientSecret', 'certificate', 'privateKey'];
    for (const key of secretKeys) {
        if (masked[key] && typeof masked[key] === 'string') {
            masked[key] = '••••••••';
        }
    }
    return masked;
}
