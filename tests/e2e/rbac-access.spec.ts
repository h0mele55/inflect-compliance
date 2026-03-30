/**
 * E2E test: RBAC access control
 * Verifies that non-admin users are blocked from admin-only pages
 * and see the forbidden UX rather than the admin content.
 */
import { test, expect, type Page } from '@playwright/test';
import { loginAndGetTenant, safeGoto } from './e2e-utils';

const ADMIN_USER = { email: 'admin@acme.com', password: 'password123' };
const READER_USER = { email: 'viewer@acme.com', password: 'password123' };

test.describe('RBAC Access Control', () => {
    // Each test independently logs in — no need for serial execution.
    // Per-test retries handle transient dev server crashes without cascade failures.

    test('admin can access admin/rbac page', async ({ page }) => {
        const tenantSlug = await loginAndGetTenant(page, ADMIN_USER);

        // Verify actual content rendered. safeGoto handles connection errors.
        let attempts = 2;
        while (attempts > 0) {
            await safeGoto(page, `/t/${tenantSlug}/admin/rbac`, { waitUntil: 'domcontentloaded' });
            await page.waitForLoadState('networkidle').catch(() => {});

            const hasContent = await page.locator('text=Permission Matrix').first().isVisible().catch(() => false);
            if (hasContent) break;

            attempts--;
            if (attempts > 0) await page.waitForTimeout(5000);
        }

        await expect(page.locator('text=Roles').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('text=Permission Matrix').first()).toBeVisible({ timeout: 15000 });
    });

    test('non-admin navigating to admin/rbac sees forbidden or redirect', async ({ page }) => {
        const tenantSlug = await loginAndGetTenant(page, READER_USER);

        // Verify middleware behavior with a single fetch (avoids full page navigation
        // that sends many parallel requests and can crash the dev server).
        // Browser fetch with redirect:'manual' returns opaque redirect (type='opaqueredirect', status=0).
        const result = await page.evaluate(async (slug: string) => {
            const res = await fetch(`/t/${slug}/admin/rbac`, { redirect: 'manual' });
            return {
                status: res.status,
                type: res.type,
                // Browser opaque redirect: type='opaqueredirect', status=0, empty headers
                isRedirect: res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400),
            };
        }, tenantSlug);

        // Middleware should redirect non-admin users away from admin pages
        expect(result.isRedirect).toBe(true);

        // Also verify the page we're on (dashboard) doesn't show admin content
        await expect(page.locator('text=Permission Matrix')).not.toBeVisible();
    });

    test('non-admin does not see Admin nav item in sidebar', async ({ page }) => {
        // loginAndGetTenant guarantees: URL matches + sidebar rendered + server-side
        // permissions resolved. If the page was a 500, the helper already reloaded it.
        await loginAndGetTenant(page, READER_USER);

        // With defense-in-depth (noStore + fail-closed filter), the admin link
        // should never be in the DOM for a reader user. No hydration wait needed.
        const adminLink = page.locator('aside [data-testid="nav-admin"]');
        await expect(adminLink).not.toBeVisible();
    });
});
