/**
 * Tests for the tenant-access gate logic (Epic 1, PR 4).
 *
 * Tests the pure `checkTenantAccess` function extracted from middleware so
 * tests are not coupled to Next.js Edge Runtime machinery. The middleware
 * itself wires the result to NextResponse redirects/JSON — those branches
 * are exercised by the E2E suite.
 *
 * Also tests `extractTenantSlugFromPath` and the updated `isPublicPath`
 * carve-outs for /no-tenant, /invite/, and /api/invites/.
 */

import {
    checkTenantAccess,
    extractTenantSlugFromPath,
    isPublicPath,
} from '@/lib/auth/guard';

describe('extractTenantSlugFromPath', () => {
    it('extracts slug from /t/:slug/dashboard', () => {
        expect(extractTenantSlugFromPath('/t/acme/dashboard')).toBe('acme');
    });

    it('extracts slug from /api/t/:slug/risks', () => {
        expect(extractTenantSlugFromPath('/api/t/acme/risks')).toBe('acme');
    });

    it('extracts slug from bare /t/:slug', () => {
        expect(extractTenantSlugFromPath('/t/acme')).toBe('acme');
    });

    it('returns null for /login', () => {
        expect(extractTenantSlugFromPath('/login')).toBeNull();
    });

    it('returns null for /no-tenant', () => {
        expect(extractTenantSlugFromPath('/no-tenant')).toBeNull();
    });

    it('returns null for /invite/sometoken', () => {
        expect(extractTenantSlugFromPath('/invite/sometoken')).toBeNull();
    });

    it('returns null for /api/invites/sometoken/start-signin', () => {
        expect(extractTenantSlugFromPath('/api/invites/sometoken/start-signin')).toBeNull();
    });
});

describe('isPublicPath — new carve-outs', () => {
    it('/no-tenant is public', () => {
        expect(isPublicPath('/no-tenant')).toBe(true);
    });

    it('/invite/abc123 is public', () => {
        expect(isPublicPath('/invite/abc123')).toBe(true);
    });

    it('/api/invites/abc123 is public', () => {
        expect(isPublicPath('/api/invites/abc123')).toBe(true);
    });

    it('/api/invites/abc123/start-signin is public', () => {
        expect(isPublicPath('/api/invites/abc123/start-signin')).toBe(true);
    });

    it('/t/acme/dashboard is NOT public', () => {
        expect(isPublicPath('/t/acme/dashboard')).toBe(false);
    });

    it('/api/t/acme/risks is NOT public', () => {
        expect(isPublicPath('/api/t/acme/risks')).toBe(false);
    });
});

describe('checkTenantAccess', () => {
    it('allows when jwtTenantSlug matches URL slug', () => {
        expect(checkTenantAccess('/t/acme/dashboard', 'acme')).toBe('allow');
    });

    it('allows API path when jwtTenantSlug matches URL slug', () => {
        expect(checkTenantAccess('/api/t/acme/risks', 'acme')).toBe('allow');
    });

    it('returns no_tenant_access when user has no tenantSlug (null)', () => {
        expect(checkTenantAccess('/t/acme/dashboard', null)).toBe('no_tenant_access');
    });

    it('returns no_tenant_access when user has no tenantSlug (undefined)', () => {
        expect(checkTenantAccess('/t/acme/dashboard', undefined)).toBe('no_tenant_access');
    });

    it('returns no_tenant_access for API path when user has no tenantSlug', () => {
        expect(checkTenantAccess('/api/t/acme/risks', null)).toBe('no_tenant_access');
    });

    it('returns cross_tenant when jwtTenantSlug does not match URL slug', () => {
        expect(checkTenantAccess('/t/beta/dashboard', 'acme')).toBe('cross_tenant');
    });

    it('returns cross_tenant for API path with mismatched slug', () => {
        expect(checkTenantAccess('/api/t/beta/risks', 'acme')).toBe('cross_tenant');
    });

    it('returns allow for /no-tenant (non-tenant path)', () => {
        expect(checkTenantAccess('/no-tenant', null)).toBe('allow');
    });

    it('returns allow for /login (non-tenant path)', () => {
        expect(checkTenantAccess('/login', null)).toBe('allow');
    });

    it('returns allow for /invite/:token (public, non-tenant path)', () => {
        expect(checkTenantAccess('/invite/sometoken', null)).toBe('allow');
    });

    it('returns allow for /api/invites/:token/start-signin (public path)', () => {
        expect(checkTenantAccess('/api/invites/tok/start-signin', null)).toBe('allow');
    });
});
