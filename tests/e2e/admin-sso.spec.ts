/**
 * E2E test: Admin SSO Configuration
 *
 * Verifies:
 * 1. Admin page shows SSO pill button (warms admin route)
 * 2. Admin can navigate to SSO config page with protocol tabs
 * 3. Admin can switch to SAML tab
 * 4. Non-admin cannot access SSO config page
 *
 * Tests are ordered so simpler/lighter tests run first, warming up the
 * dev-server compilation cache before the heavier SSO page tests.
 */
import { test, expect, type Page } from '@playwright/test';

const ADMIN_USER = { email: 'admin@acme.com', password: 'password123' };
const READER_USER = { email: 'viewer@acme.com', password: 'password123' };

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
    return match[1];
}

test.describe('Admin SSO Configuration', () => {

    // ── Warm-up test: hits /admin (already compiled) ──
    test('admin page shows SSO pill button', async ({ page }) => {
        const tenantSlug = await loginAndGetTenant(page, ADMIN_USER);

        await safeGoto(page, `/t/${tenantSlug}/admin`, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => {});

        await expect(page.locator('#sso-pill-btn')).toBeVisible({ timeout: 15000 });
    });

    // ── SSO page tests: server should be warm from admin page ──
    test('admin can view SSO config page with protocol tabs', async ({ page }) => {
        const tenantSlug = await loginAndGetTenant(page, ADMIN_USER);

        await safeGoto(page, `/t/${tenantSlug}/admin/sso`, { waitUntil: 'domcontentloaded' });

        // Page header — wait up to 60s for first cold-compile
        await expect(page.getByRole('heading', { name: /SSO/i })).toBeVisible({ timeout: 60000 });

        // Protocol tabs
        await expect(page.getByRole('button', { name: 'OIDC' })).toBeVisible({ timeout: 5000 });
        await expect(page.getByRole('button', { name: /SAML/i })).toBeVisible({ timeout: 5000 });

        // Save button
        await expect(page.getByRole('button', { name: /Save Configuration/i })).toBeVisible({ timeout: 5000 });
    });

    test('admin can switch to SAML tab', async ({ page }) => {
        const tenantSlug = await loginAndGetTenant(page, ADMIN_USER);

        await safeGoto(page, `/t/${tenantSlug}/admin/sso`, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => {});
        await expect(page.getByRole('button', { name: /SAML/i })).toBeVisible({ timeout: 30000 });

        await page.getByRole('button', { name: /SAML/i }).click();

        // SAML-specific heading should appear
        await expect(page.getByRole('heading', { name: /SAML/i })).toBeVisible({ timeout: 5000 });
    });

    // ── Guard test: non-admin ──
    test('non-admin cannot access /admin/sso', async ({ page }) => {
        const tenantSlug = await loginAndGetTenant(page, READER_USER);

        const result = await page.evaluate(async (slug: string) => {
            const res = await fetch(`/t/${slug}/admin/sso`, { redirect: 'manual' });
            return {
                status: res.status,
                type: res.type,
                isRedirect: res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400),
            };
        }, tenantSlug);

        expect(result.isRedirect).toBe(true);
    });
});
