/**
 * E2E test: Admin Member Management
 *
 * Verifies:
 * 1. Admin can navigate to Members & Roles page
 * 2. Admin sees member list table
 * 3. Admin can open invite form
 * 4. Non-admin cannot access Members & Roles page
 */
import { test, expect } from '@playwright/test';
import { loginAndGetTenant, safeGoto } from './e2e-utils';

const ADMIN_USER = { email: 'admin@acme.com', password: 'password123' };
const READER_USER = { email: 'viewer@acme.com', password: 'password123' };

test.describe('Admin Member Management', () => {

    test('admin can view members page and see member list', async ({ page }) => {
        const tenantSlug = await loginAndGetTenant(page, ADMIN_USER);

        await safeGoto(page, `/t/${tenantSlug}/admin/members`, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => {});

        // Page loads with header
        await expect(page.getByRole('heading', { name: /Members/i })).toBeVisible({ timeout: 30000 });

        // Members table should exist and have at least one row (the admin user)
        await expect(page.locator('#members-table')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('#members-table tbody tr').first()).toBeVisible({ timeout: 15000 });
    });

    test('admin can open invite form', async ({ page }) => {
        const tenantSlug = await loginAndGetTenant(page, ADMIN_USER);

        await safeGoto(page, `/t/${tenantSlug}/admin/members`, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => {});
        await expect(page.locator('#members-table')).toBeVisible({ timeout: 30000 });

        // Click invite button
        await page.click('#invite-member-btn');

        // Invite form should appear
        await expect(page.locator('#invite-form')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#invite-email-input')).toBeVisible();
        await expect(page.locator('#invite-role-select')).toBeVisible();
        await expect(page.locator('#send-invite-btn')).toBeVisible();
    });

    test('admin page shows members pill button', async ({ page }) => {
        const tenantSlug = await loginAndGetTenant(page, ADMIN_USER);

        await safeGoto(page, `/t/${tenantSlug}/admin`, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => {});

        await expect(page.locator('#members-pill-btn')).toBeVisible({ timeout: 15000 });
    });

    test('non-admin cannot access /admin/members', async ({ page }) => {
        const tenantSlug = await loginAndGetTenant(page, READER_USER);

        // Verify middleware blocks non-admin from admin pages
        const result = await page.evaluate(async (slug: string) => {
            const res = await fetch(`/t/${slug}/admin/members`, { redirect: 'manual' });
            return {
                status: res.status,
                type: res.type,
                isRedirect: res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400),
            };
        }, tenantSlug);

        expect(result.isRedirect).toBe(true);
    });
});
