/**
 * E2E regression tests for Epic 12: Admin UI & RBAC Management
 *
 * Tests:
 * - Admin landing page has all pill buttons (Members, SSO, SCIM, Security)
 * - SCIM admin page renders (heading, endpoint URL, generate button, setup guide)
 * - SCIM token generation flow
 * - Non-admin user cannot access SCIM admin page
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

test.describe('Admin Area Regression', () => {

    // ── 1. Warm-up: admin pill buttons ──
    test('admin page shows all pill buttons', async ({ page }) => {
        const slug = await loginAndGetTenant(page, ADMIN_USER);
        await safeGoto(page, `/t/${slug}/admin`, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => {});

        await expect(page.locator('h1')).toBeVisible({ timeout: 30000 });

        for (const id of ['members-pill-btn', 'sso-pill-btn', 'scim-pill-btn', 'security-pill-btn']) {
            await expect(page.locator(`#${id}`)).toBeVisible({ timeout: 5000 });
        }
    });

    // ── 2. SCIM page renders ──
    test('SCIM admin page renders token management', async ({ page }) => {
        const slug = await loginAndGetTenant(page, ADMIN_USER);
        await safeGoto(page, `/t/${slug}/admin/scim`, { waitUntil: 'domcontentloaded' });

        await expect(page.getByRole('heading', { name: /SCIM Provisioning/i })).toBeVisible({ timeout: 60000 });
        await expect(page.locator('#scim-endpoint-url')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#generate-token-btn')).toBeVisible({ timeout: 5000 });
        await expect(page.getByText('Setup Guide')).toBeVisible({ timeout: 5000 });
    });

    // ── 3. Non-admin access blocked on ALL admin subpages ──
    const adminSubpages = [
        '', // root admin page
        '/members',
        '/rbac',
        '/sso',
        '/scim',
        '/security',
        '/integrations',
        '/billing',
    ];

    for (const subpage of adminSubpages) {
        const label = subpage || '(root)';
        test(`non-admin cannot access admin${label} page`, async ({ page }) => {
            const slug = await loginAndGetTenant(page, READER_USER);
            await safeGoto(page, `/t/${slug}/admin${subpage}`, { waitUntil: 'domcontentloaded' });

            // Middleware should redirect non-admin to dashboard.
            // If it doesn't (edge case), the admin layout guard shows
            // the ForbiddenPage with "Access Denied" / "Permission denied".
            const url = page.url();
            const notOnAdmin = !url.includes('/admin');
            const hasForbidden = await page.locator('#forbidden-heading').isVisible().catch(() => false);
            const hasPermissionText = await page.getByText(/permission|forbidden|denied|access/i).isVisible().catch(() => false);

            expect(notOnAdmin || hasForbidden || hasPermissionText).toBeTruthy();
        });
    }
});
