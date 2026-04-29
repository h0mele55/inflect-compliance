/**
 * GAP-23 — `createIsolatedTenant()` self-test + canonical example.
 *
 * This spec serves two purposes:
 *
 *   1. Sanity-checks the factory in `e2e-utils.ts`:
 *      - returns the full credential set
 *      - two invocations produce distinct tenants/users/slugs (the
 *        precondition for parallelising the suite)
 *      - the returned credentials authenticate end-to-end via the
 *        production credentials flow and the resulting page lands
 *        on `/t/<slug>/dashboard`
 *
 *   2. Acts as the reference adoption example for spec authors. A
 *      future spec wanting per-test isolation can copy the
 *      `test.describe(...)` block below and replace the assertions
 *      with its own.
 *
 * The factory is deliberately exercised via Playwright's request
 * fixture (the standard pattern for API-driven setup) AND via an
 * implicit ephemeral context (the no-options path) so both
 * call shapes are covered.
 */

import { expect, test } from '@playwright/test';
import {
    createIsolatedTenant,
    signInAs,
    type IsolatedTenantCredentials,
} from './e2e-utils';

test.describe('GAP-23 — createIsolatedTenant', () => {
    test('returns a full set of credentials with valid shape', async ({ request }) => {
        const tenant = await createIsolatedTenant({ request });

        // Slug shape: lowercase + hyphens (the route's slug derivation).
        expect(tenant.tenantSlug).toMatch(/^[a-z0-9][a-z0-9-]*$/);
        expect(tenant.tenantId).toMatch(/^[a-z0-9]+$/); // cuid
        expect(tenant.tenantName.length).toBeGreaterThan(0);

        // Owner: e2e.test domain (intentionally non-routable so a
        // mis-fired verification email never escapes).
        expect(tenant.ownerEmail).toMatch(/@e2e\.test$/);
        expect(tenant.ownerUserId).toMatch(/^[a-z0-9]+$/);
        expect(tenant.ownerName.length).toBeGreaterThan(0);

        // Password is high-entropy (HIBP-safe). 32 hex chars + 4-char
        // prefix = 36 chars, mixed-case + symbol.
        expect(tenant.ownerPassword.length).toBeGreaterThanOrEqual(32);
        expect(tenant.ownerPassword).toMatch(/[A-Z]/);
        expect(tenant.ownerPassword).toMatch(/[!@#$%^&*]/);
    });

    test('produces distinct tenants/users/slugs across invocations', async ({ request }) => {
        // Two back-to-back calls — even with `Date.now()` rounding to
        // the same millisecond, the UUIDv4 prefix in orgName forces
        // distinct slug derivation.
        const a = await createIsolatedTenant({ request });
        const b = await createIsolatedTenant({ request });

        expect(a.tenantId).not.toBe(b.tenantId);
        expect(a.tenantSlug).not.toBe(b.tenantSlug);
        expect(a.ownerUserId).not.toBe(b.ownerUserId);
        expect(a.ownerEmail).not.toBe(b.ownerEmail);
    });

    test('returned credentials authenticate end-to-end and land on the right tenant', async ({ page, request }) => {
        const tenant = await createIsolatedTenant({
            request,
            namePrefix: 'auth-check',
        });

        const slug = await signInAs(page, tenant);
        expect(slug).toBe(tenant.tenantSlug);

        // Verify the dashboard actually rendered (not just URL match).
        // Sidebar is the most stable hydration signal across the app.
        await expect(page.locator('aside').first()).toBeVisible({
            timeout: 30_000,
        });

        // Also confirm we're scoped to OUR tenant — no leakage from a
        // sibling test's seeded state.
        await expect(page).toHaveURL(new RegExp(`/t/${tenant.tenantSlug}/dashboard`));
    });

    test('works without a caller-supplied request context (ephemeral path)', async () => {
        // The no-options path spins up its own request context against
        // process.env.URL / the Playwright baseURL and disposes it
        // after the call returns. Useful for global-setup hooks that
        // run before any test fixture exists.
        const tenant: IsolatedTenantCredentials = await createIsolatedTenant();

        expect(tenant.tenantSlug).toMatch(/^[a-z0-9-]+$/);
        expect(tenant.ownerEmail).toMatch(/@e2e\.test$/);
        expect(tenant.ownerPassword.length).toBeGreaterThanOrEqual(32);
    });
});
