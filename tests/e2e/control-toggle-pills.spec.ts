import { test, expect, Page } from '@playwright/test';

const TEST_USER = { email: 'admin@acme.com', password: 'password123' };

async function loginAndGetTenant(page: Page): Promise<string> {
    await page.goto('/login');
    await page.waitForSelector('input[type="email"]', { timeout: 60000 });
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/t\/[^/]+\/dashboard/, { timeout: 60000 });
    const url = new URL(page.url());
    const match = url.pathname.match(/^\/t\/([^/]+)\//);
    if (!match) throw new Error('Could not extract tenant slug from ' + url.pathname);
    return match[1];
}

test.describe('Control Toggle Pills', () => {
    test.describe.configure({ mode: 'serial' });

    let tenantSlug: string;

    test('status pill click advances status', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForSelector('#controls-table', { timeout: 15000 });

        // Find first status pill button
        const firstRow = page.locator('#controls-table tbody tr').first();
        const statusPill = firstRow.locator('[id^="status-pill-"]');

        // Get initial text
        const initialText = (await statusPill.textContent())!.trim();
        expect(initialText).toBeTruthy();

        // Click to advance
        const res1 = page.waitForResponse(res => res.url().includes('/status') && res.request().method() === 'POST');
        await statusPill.click();
        await res1;

        // Wait for optimistic update — the text should change
        await expect(statusPill).not.toHaveText(initialText, { timeout: 5000 });
        const newText = (await statusPill.textContent())!.trim();
        expect(newText).not.toBe(initialText);
    });

    test('status pill click advances twice consecutively', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForSelector('#controls-table', { timeout: 15000 });

        const firstRow = page.locator('#controls-table tbody tr').first();
        const statusPill = firstRow.locator('[id^="status-pill-"]');

        const text1 = (await statusPill.textContent())!.trim();

        // Click once
        const resA = page.waitForResponse(res => res.url().includes('/status') && res.request().method() === 'POST');
        await statusPill.click();
        await resA;
        await expect(statusPill).not.toHaveText(text1, { timeout: 5000 });
        const text2 = (await statusPill.textContent())!.trim();

        // Wait for loading to clear before clicking again
        await page.waitForTimeout(500);

        // Click twice
        const resB = page.waitForResponse(res => res.url().includes('/status') && res.request().method() === 'POST');
        await statusPill.click();
        await resB;
        await expect(statusPill).not.toHaveText(text2, { timeout: 5000 });
        const text3 = (await statusPill.textContent())!.trim();

        // All three should be different
        expect(text1).not.toBe(text2);
        expect(text2).not.toBe(text3);
    });

    test('applicability pill opens justification modal; Save sets N/A', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForSelector('#controls-table', { timeout: 15000 });

        // Find a row with applicability "Yes" (APPLICABLE)
        const rows = page.locator('#controls-table tbody tr');
        const count = await rows.count();
        let targetPill = null;

        for (let i = 0; i < count; i++) {
            const pill = rows.nth(i).locator('[id^="applicability-pill-"]');
            const text = await pill.textContent();
            if (text?.trim() === 'Yes') {
                targetPill = pill;
                break;
            }
        }

        if (!targetPill) {
            test.skip();
            return;
        }

        // Click to toggle to NOT_APPLICABLE — should open modal
        await targetPill.click();
        await expect(page.locator('#justification-modal-backdrop')).toBeVisible({ timeout: 3000 });
        await expect(page.locator('#justification-input')).toBeVisible();

        // Save button should be disabled without justification
        await expect(page.locator('#justification-save-btn')).toBeDisabled();

        // Type justification
        await page.locator('#justification-input').fill('Not applicable per risk assessment');
        await expect(page.locator('#justification-save-btn')).toBeEnabled();

        // Save
        const resApp = page.waitForResponse(res => res.url().includes('/applicability') && res.request().method() === 'POST');
        await page.locator('#justification-save-btn').click();
        await resApp;
        await expect(page.locator('#justification-modal-backdrop')).toBeHidden({ timeout: 3000 });

        // Pill should now show N/A
        const text = await targetPill.textContent();
        expect(text?.trim()).toBe('N/A');
    });

    test('justification modal Cancel keeps original applicability', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForSelector('#controls-table', { timeout: 15000 });

        // Find a row with applicability "Yes"
        const rows = page.locator('#controls-table tbody tr');
        const count = await rows.count();
        let targetPill = null;

        for (let i = 0; i < count; i++) {
            const pill = rows.nth(i).locator('[id^="applicability-pill-"]');
            const text = await pill.textContent();
            if (text?.trim() === 'Yes') {
                targetPill = pill;
                break;
            }
        }

        if (!targetPill) {
            test.skip();
            return;
        }

        // Click to open modal
        await targetPill.click();
        await expect(page.locator('#justification-modal-backdrop')).toBeVisible({ timeout: 3000 });

        // Cancel
        await page.locator('#justification-cancel-btn').click();
        await expect(page.locator('#justification-modal-backdrop')).toBeHidden({ timeout: 3000 });

        // Pill should still show "Yes"
        const text = await targetPill.textContent();
        expect(text?.trim()).toBe('Yes');
    });

    test('reader user sees non-interactive pills', async ({ page }) => {
        // Login as reader
        await page.goto('/login');
        await page.waitForSelector('input[type="email"]', { timeout: 60000 });
        await page.fill('input[type="email"]', 'viewer@acme.com');
        await page.fill('input[type="password"]', 'password123');
        await page.click('button[type="submit"]');
        await page.waitForURL(/\/t\/[^/]+\/dashboard/, { timeout: 60000 });
        const url = new URL(page.url());
        const match = url.pathname.match(/^\/t\/([^/]+)\//);
        tenantSlug = match?.[1] || tenantSlug;

        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForSelector('#controls-table', { timeout: 15000 });
        await page.waitForTimeout(2000); // let hydration settle

        // Reader should NOT see clickable status pills (they should be <span> not <button>)
        const statusPillBtn = page.locator('#controls-table tbody tr').first().locator('button[id^="status-pill-"]');
        await expect(statusPillBtn).not.toBeVisible({ timeout: 5000 });
    });
});
