import { test, expect } from '@playwright/test';
import { loginAndGetTenant, safeGoto } from './e2e-utils';

/**
 * Epic 54 — New Risk modal migration.
 *
 * Verifies the modal replaces the legacy `/risks/new` wizard without
 * breaking deep links. The `/risks/new` route is now a server redirect
 * shim → `/risks?create=1`, which RisksClient detects on mount and
 * opens the modal automatically. The original pre-migration suites
 * that `page.goto('/risks/new')` keep passing against the new surface.
 */

test.describe('Epic 54 — New Risk modal', () => {
    test.describe.configure({ mode: 'serial' });

    let tenantSlug: string;

    test('clicking + New Risk opens the modal without navigating away', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/risks`);
        await page.waitForSelector('#new-risk-btn', { timeout: 15000 });
        const listUrl = page.url();

        await page.click('#new-risk-btn');

        await expect(page.locator('#risk-title')).toBeVisible({ timeout: 5000 });
        expect(page.url()).toBe(listUrl);

        // Close the modal so it doesn't leak into downstream serial-mode
        // tests (Vaul/Radix leave global focus-trap + overlay state
        // attached to the shared browser context otherwise).
        await page.click('#new-risk-cancel-btn');
        await expect(page.locator('#risk-title')).toBeHidden({ timeout: 5000 });
    });

    test('Submit is disabled until Title is filled', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/risks`);
        await page.waitForSelector('#new-risk-btn', { timeout: 15000 });
        await page.click('#new-risk-btn');
        await expect(page.locator('#risk-title')).toBeVisible({ timeout: 5000 });

        await expect(page.locator('#submit-risk')).toBeDisabled();
        await page.fill('#risk-title', 'T');
        await expect(page.locator('#submit-risk')).toBeEnabled();
        await page.fill('#risk-title', '');
        await expect(page.locator('#submit-risk')).toBeDisabled();
    });

    test('Cancel closes the modal and the list stays visible', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/risks`);
        await page.waitForSelector('#new-risk-btn', { timeout: 15000 });
        await page.click('#new-risk-btn');
        await expect(page.locator('#risk-title')).toBeVisible({ timeout: 5000 });

        await page.click('#new-risk-cancel-btn');

        await expect(page.locator('#risk-title')).toBeHidden({ timeout: 5000 });
        await expect(page.locator('[data-testid="risks-table"]')).toBeVisible();
    });

    test('submitting creates the risk and the list refreshes', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/risks`);
        await page.waitForSelector('#new-risk-btn', { timeout: 15000 });
        await page.click('#new-risk-btn');
        await expect(page.locator('#risk-title')).toBeVisible({ timeout: 5000 });

        const uid = Date.now().toString(36);
        const title = `Modal Risk ${uid}`;
        await page.fill('#risk-title', title);
        await page.fill('#risk-description', 'Created via the Epic 54 modal.');

        const [response] = await Promise.all([
            page.waitForResponse(
                (r) =>
                    r.url().includes('/api/t/') &&
                    r.url().endsWith('/risks') &&
                    r.request().method() === 'POST',
            ),
            page.click('#submit-risk'),
        ]);
        expect(response.status(), 'POST /risks succeeded').toBeLessThan(400);

        // Modal closes on success.
        await expect(page.locator('#risk-title')).toBeHidden({ timeout: 10000 });

        // List refreshes — the newly created risk appears.
        await expect(page.locator('[data-testid="risks-table"]')).toContainText(
            title,
            { timeout: 15000 },
        );
    });

    test('/risks/new deep link redirects to the list with the modal auto-open', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/risks/new`);

        // After the redirect shim, the URL lands on /risks and the modal
        // auto-opens. The `?create=1` flag is stripped on mount.
        await expect(page.locator('#risk-title')).toBeVisible({ timeout: 15000 });
        await expect(page).toHaveURL(/\/risks(\?|$)/);
    });
});
