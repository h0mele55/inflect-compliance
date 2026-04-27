/**
 * GAP O4-1 — middleware-level org-access gate.
 *
 * Pure-function tests for `extractOrgSlugFromPath`, `isOrgPath`, and
 * `checkOrgAccess`, mirroring the existing `middleware-tenant-gate.test.ts`
 * pattern. The middleware itself wires the result to NextResponse
 * redirects/JSON; those branches are exercised by `tests/unit/
 * middleware-org-route.test.ts` against the actual middleware export.
 *
 * Behaviour locked here:
 *   1. Slug extraction handles both web (`/org/:slug/...`) and API
 *      (`/api/org/:slug/...`) shapes.
 *   2. `isOrgPath` recognises both shapes; non-org paths fall through.
 *   3. `checkOrgAccess`:
 *        - `allow` when the URL slug is in the user's orgMemberships.
 *        - `no_org_access` when the user has zero orgMemberships.
 *        - `cross_org` when the user has memberships but none match
 *          the URL slug.
 *   4. Public-path carve-outs (e.g. invite preview) still pass through
 *      (defence-in-depth — the middleware already runs `isPublicPath`
 *      first).
 *   5. `/org/*` and `/t/*` are parallel: same gate shape, same 'allow'
 *      contract, different membership source.
 */

import {
    checkOrgAccess,
    extractOrgSlugFromPath,
    isOrgPath,
} from '@/lib/auth/guard';

describe('extractOrgSlugFromPath', () => {
    it('extracts slug from /org/:slug/', () => {
        expect(extractOrgSlugFromPath('/org/acme-org/')).toBe('acme-org');
    });

    it('extracts slug from /org/:slug/tenants/new', () => {
        expect(extractOrgSlugFromPath('/org/acme-org/tenants/new')).toBe('acme-org');
    });

    it('extracts slug from /api/org/:slug/portfolio', () => {
        expect(extractOrgSlugFromPath('/api/org/acme-org/portfolio')).toBe(
            'acme-org',
        );
    });

    it('extracts slug from bare /org/:slug', () => {
        expect(extractOrgSlugFromPath('/org/acme-org')).toBe('acme-org');
    });

    it('returns null for /t/:slug paths (not org-scoped)', () => {
        expect(extractOrgSlugFromPath('/t/acme/dashboard')).toBeNull();
    });

    it('returns null for /login', () => {
        expect(extractOrgSlugFromPath('/login')).toBeNull();
    });

    it('returns null for /api/auth/session', () => {
        expect(extractOrgSlugFromPath('/api/auth/session')).toBeNull();
    });
});

describe('isOrgPath', () => {
    it('matches /org/:slug/...', () => {
        expect(isOrgPath('/org/acme-org/')).toBe(true);
        expect(isOrgPath('/org/acme-org/tenants')).toBe(true);
    });

    it('matches /api/org/:slug/...', () => {
        expect(isOrgPath('/api/org/acme-org/portfolio')).toBe(true);
    });

    it('does NOT match /t/:slug', () => {
        expect(isOrgPath('/t/acme/dashboard')).toBe(false);
    });

    it('does NOT match unrelated paths', () => {
        expect(isOrgPath('/login')).toBe(false);
        expect(isOrgPath('/api/auth/session')).toBe(false);
        expect(isOrgPath('/admin')).toBe(false);
    });
});

describe('checkOrgAccess', () => {
    it('allows when orgMemberships contains the URL slug', () => {
        expect(
            checkOrgAccess('/org/acme-org/', [{ slug: 'acme-org' }]),
        ).toBe('allow');
    });

    it('allows API path when orgMemberships contains the URL slug', () => {
        expect(
            checkOrgAccess('/api/org/acme-org/portfolio', [
                { slug: 'acme-org' },
            ]),
        ).toBe('allow');
    });

    it('returns no_org_access when orgMemberships is null', () => {
        expect(checkOrgAccess('/org/acme-org/', null)).toBe('no_org_access');
    });

    it('returns no_org_access when orgMemberships is undefined', () => {
        expect(checkOrgAccess('/org/acme-org/', undefined)).toBe(
            'no_org_access',
        );
    });

    it('returns no_org_access when orgMemberships is empty', () => {
        expect(checkOrgAccess('/org/acme-org/', [])).toBe('no_org_access');
    });

    it('returns cross_org when URL slug is not in the orgMemberships', () => {
        expect(
            checkOrgAccess('/org/some-other-org/', [{ slug: 'acme-org' }]),
        ).toBe('cross_org');
    });

    it('returns allow when the user belongs to multiple orgs and the URL slug matches one', () => {
        expect(
            checkOrgAccess('/org/second-org/dashboard', [
                { slug: 'acme-org' },
                { slug: 'second-org' },
            ]),
        ).toBe('allow');
    });

    it('returns allow for non-org paths regardless of memberships state', () => {
        expect(checkOrgAccess('/t/acme/dashboard', null)).toBe('allow');
        expect(checkOrgAccess('/login', null)).toBe('allow');
        expect(checkOrgAccess('/api/auth/session', null)).toBe('allow');
    });
});
