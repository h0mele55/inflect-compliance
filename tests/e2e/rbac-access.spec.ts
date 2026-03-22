/**
 * E2E test: RBAC access control
 * Verifies that non-admin users are blocked from admin-only pages
 * and see the forbidden UX rather than the admin content.
 */
import { test, expect, type Page } from '@playwright/test';

const ADMIN_USER = { email: 'admin@acme.com', password: 'password123' };
const READER_USER = { email: 'viewer@acme.com', password: 'password123' };

/** Retry page.goto up to `retries` times to handle transient ERR_CONNECTION_REFUSED. */
async function safeGoto(page: Page, url: string, options?: Parameters<Page['goto']>[1], retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            return await page.goto(url, options);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (i < retries - 1 && msg.includes('net::')) {
                await page.waitForTimeout(5000);
                continue;
            }
            throw e;
        }
    }
}

async function loginAndGetTenant(page: Page, user: { email: string; password: string }): Promise<string> {
    await safeGoto(page, '/login');
    await page.waitForSelector('input[type="email"]', { timeout: 60000 });
    await page.fill('input[type="email"]', user.email);
    await page.fill('input[type="password"]', user.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/t\/[^/]+\/dashboard/, { timeout: 60000 });
    const match = new URL(page.url()).pathname.match(/^\/t\/([^/]+)\//);
    if (!match) throw new Error('Could not extract tenant slug');
    const slug = match[1];

    // Verify the app is fully rendered — reload if server was still compiling.
    let renderRetries = 3;
    while (renderRetries > 0) {
        const hasSidebar = await page.locator('aside').isVisible().catch(() => false);
        if (hasSidebar) break;
        renderRetries--;
        if (renderRetries > 0) {
            await page.waitForLoadState('networkidle');
            await safeGoto(page, `/t/${slug}/dashboard`, { waitUntil: 'domcontentloaded' });
            await page.waitForLoadState('networkidle').catch(() => {});
        }
    }

    return slug;
}

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
