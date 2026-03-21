import type { RequestContext } from '@/app-layer/types';
import type { TenantIdentityProvider, UserIdentityLink } from '@prisma/client';
import * as SsoConfigRepo from '@/app-layer/repositories/SsoConfigRepository';
import * as IdentityLinkRepo from '@/app-layer/repositories/IdentityLinkRepository';
import { UpsertSsoConfigInput } from '@/app-layer/schemas/sso-config.schemas';
import { forbidden, notFound } from '@/lib/errors/types';
import prisma from '@/lib/prisma';

/**
 * Enterprise SSO Usecases
 *
 * These usecases manage tenant-scoped identity provider configuration and
 * external identity linking. They enforce RBAC, tenant isolation, and safe
 * account linking rules.
 */

// ─── Configuration Management ────────────────────────────────────────

/**
 * List all SSO identity providers configured for the tenant.
 * Requires ADMIN role.
 */
export async function getTenantSsoConfig(
    ctx: RequestContext
): Promise<TenantIdentityProvider[]> {
    if (!ctx.permissions.canAdmin) throw forbidden('Only admins can view SSO configuration');
    return SsoConfigRepo.findByTenantId(ctx.tenantId);
}

/**
 * Get a single SSO provider by ID.
 * Requires ADMIN role.
 */
export async function getTenantSsoConfigById(
    ctx: RequestContext,
    providerId: string
): Promise<TenantIdentityProvider> {
    if (!ctx.permissions.canAdmin) throw forbidden('Only admins can view SSO configuration');
    const provider = await SsoConfigRepo.findById(ctx.tenantId, providerId);
    if (!provider) throw notFound('Identity provider not found');
    return provider;
}

/**
 * Create or update a tenant identity provider.
 * Requires ADMIN role. Validates input via Zod schema.
 */
export async function upsertTenantSsoConfig(
    ctx: RequestContext,
    input: UpsertSsoConfigInput
): Promise<TenantIdentityProvider> {
    if (!ctx.permissions.canAdmin) throw forbidden('Only admins can manage SSO configuration');

    // If updating, verify the provider belongs to this tenant
    if (input.id) {
        const existing = await SsoConfigRepo.findById(ctx.tenantId, input.id);
        if (!existing) throw notFound('Identity provider not found');
    }

    return SsoConfigRepo.upsert(ctx.tenantId, {
        id: input.id,
        name: input.name,
        type: input.type,
        isEnabled: input.isEnabled,
        isEnforced: input.isEnforced,
        emailDomains: input.emailDomains,
        configJson: input.config,
    });
}

/**
 * Delete a tenant identity provider.
 * Requires ADMIN role. Also removes all identity links for this provider.
 */
export async function deleteTenantSsoConfig(
    ctx: RequestContext,
    providerId: string
): Promise<void> {
    if (!ctx.permissions.canAdmin) throw forbidden('Only admins can manage SSO configuration');

    const existing = await SsoConfigRepo.findById(ctx.tenantId, providerId);
    if (!existing) throw notFound('Identity provider not found');

    // Cascade: remove identity links, then the provider
    await SsoConfigRepo.remove(ctx.tenantId, providerId);
}

/**
 * Enable or disable a tenant SSO provider.
 * Requires ADMIN role.
 */
export async function toggleTenantSso(
    ctx: RequestContext,
    providerId: string,
    enabled: boolean
): Promise<TenantIdentityProvider> {
    if (!ctx.permissions.canAdmin) throw forbidden('Only admins can manage SSO configuration');

    const existing = await SsoConfigRepo.findById(ctx.tenantId, providerId);
    if (!existing) throw notFound('Identity provider not found');

    return SsoConfigRepo.setEnabled(ctx.tenantId, providerId, enabled);
}

/**
 * Set whether SSO is enforced (local login disabled) for a provider.
 * Requires ADMIN role.
 *
 * When enforced:
 *   - Users cannot log in with credentials
 *   - SSO is the only authentication method
 *   - Break-glass: ADMIN users who have passwordHash set can still use local login
 */
export async function setTenantSsoEnforced(
    ctx: RequestContext,
    providerId: string,
    enforced: boolean
): Promise<TenantIdentityProvider> {
    if (!ctx.permissions.canAdmin) throw forbidden('Only admins can manage SSO configuration');

    const existing = await SsoConfigRepo.findById(ctx.tenantId, providerId);
    if (!existing) throw notFound('Identity provider not found');

    // Safety check: if enabling enforcement, ensure at least one admin has SSO linked
    if (enforced) {
        const adminMembers = await prisma.tenantMembership.findMany({
            where: { tenantId: ctx.tenantId, role: 'ADMIN' },
            include: { user: true },
        });

        // At least one admin must have a password (break-glass) or SSO link
        const hasBreakGlassAdmin = adminMembers.some((m) => m.user.passwordHash);
        if (!hasBreakGlassAdmin) {
            throw forbidden(
                'Cannot enforce SSO: at least one admin must have a local password for break-glass access'
            );
        }
    }

    return SsoConfigRepo.setEnforced(ctx.tenantId, providerId, enforced);
}

// ─── SSO Login Resolution ────────────────────────────────────────────

/**
 * Resolve the SSO configuration for a tenant login page.
 * This is a public/unauthenticated operation — no ctx required.
 *
 * Returns only the minimal info needed for the login page:
 * - provider type, name, isEnforced
 * - does NOT expose configJson secrets
 */
export async function resolveSsoForTenant(
    tenantSlug: string
): Promise<{
    hasSso: boolean;
    isEnforced: boolean;
    providers: Array<{ id: string; type: string; name: string }>;
}> {
    const tenant = await prisma.tenant.findUnique({
        where: { slug: tenantSlug },
        select: { id: true },
    });

    if (!tenant) {
        return { hasSso: false, isEnforced: false, providers: [] };
    }

    const enabledProviders = await SsoConfigRepo.findEnabledByTenantId(tenant.id);

    if (enabledProviders.length === 0) {
        return { hasSso: false, isEnforced: false, providers: [] };
    }

    return {
        hasSso: true,
        isEnforced: enabledProviders.some((p) => p.isEnforced),
        providers: enabledProviders.map((p) => ({
            id: p.id,
            type: p.type,
            name: p.name,
        })),
    };
}

/**
 * Resolve SSO provider by email domain.
 * Used for domain-based auto-discovery on the login page.
 */
export async function resolveSsoByDomain(
    email: string
): Promise<{
    found: boolean;
    tenantSlug?: string;
    providerId?: string;
    providerName?: string;
}> {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return { found: false };

    const provider = await SsoConfigRepo.findByDomain(domain);
    if (!provider) return { found: false };

    const tenant = await prisma.tenant.findUnique({
        where: { id: provider.tenantId },
        select: { slug: true },
    });

    return {
        found: true,
        tenantSlug: tenant?.slug,
        providerId: provider.id,
        providerName: provider.name,
    };
}

// ─── Identity Linking ────────────────────────────────────────────────

/**
 * Link an external identity to a local user during SSO callback.
 *
 * Resolution order:
 * 1. Check for existing link by (providerId, externalSubject)
 * 2. If no link, match by email → User → TenantMembership
 * 3. If user found with membership, create link
 * 4. If no user/membership found, reject (no auto-provisioning)
 *
 * Returns the userId if successful, null if no matching user found.
 */
export async function linkExternalIdentity(
    tenantId: string,
    providerId: string,
    externalSubject: string,
    email: string
): Promise<{ userId: string; isNewLink: boolean } | null> {
    // 1. Check for existing link
    const existingLink = await IdentityLinkRepo.findByProviderAndSubject(
        providerId,
        externalSubject
    );

    if (existingLink) {
        // Verify the link belongs to the correct tenant
        if (existingLink.tenantId !== tenantId) {
            // Cross-tenant attack — reject
            return null;
        }
        await IdentityLinkRepo.updateLastLogin(existingLink.id);
        return { userId: existingLink.userId, isNewLink: false };
    }

    // 2. No existing link — try to match by email
    const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true },
    });

    if (!user) return null;

    // 3. Verify user has membership in this tenant
    const membership = await prisma.tenantMembership.findUnique({
        where: {
            tenantId_userId: {
                tenantId,
                userId: user.id,
            },
        },
    });

    if (!membership) return null;

    // 4. Check if user already has a different link for this provider
    const existingUserLink = await IdentityLinkRepo.findByUserAndProvider(
        user.id,
        providerId
    );

    if (existingUserLink) {
        // User already linked with a different subject — this is suspicious
        // Don't overwrite the existing link
        return null;
    }

    // 5. Create the identity link
    await IdentityLinkRepo.linkIdentity({
        userId: user.id,
        tenantId,
        providerId,
        externalSubject,
        emailAtLinkTime: email.toLowerCase(),
    });

    return { userId: user.id, isNewLink: true };
}

/**
 * Check if local login is allowed for a user in a specific tenant.
 * Returns false if SSO is enforced AND the user is not a break-glass admin.
 */
export async function isLocalLoginAllowed(
    tenantId: string,
    userId: string
): Promise<boolean> {
    // Check if any provider in this tenant enforces SSO
    const enforcedProviders = await prisma.tenantIdentityProvider.findMany({
        where: { tenantId, isEnabled: true, isEnforced: true },
    });

    if (enforcedProviders.length === 0) return true;

    // SSO is enforced — check if user is a break-glass admin
    const membership = await prisma.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId, userId } },
    });

    if (membership?.role !== 'ADMIN') return false;

    // Admin — check if they have a local password (break-glass)
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true },
    });

    return !!user?.passwordHash;
}

// ─── Identity Link Admin ────────────────────────────────────────────

/**
 * List all identity links for a user. Requires ADMIN role.
 */
export async function getIdentityLinks(
    ctx: RequestContext,
    userId: string
): Promise<UserIdentityLink[]> {
    if (!ctx.permissions.canAdmin) throw forbidden('Only admins can view identity links');
    return IdentityLinkRepo.findByUserId(userId);
}

/**
 * Remove an identity link for a user. Requires ADMIN role.
 */
export async function unlinkIdentity(
    ctx: RequestContext,
    userId: string,
    providerId: string
): Promise<void> {
    if (!ctx.permissions.canAdmin) throw forbidden('Only admins can manage identity links');
    await IdentityLinkRepo.unlinkIdentity(userId, providerId);
}
