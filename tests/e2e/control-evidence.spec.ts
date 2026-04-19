import { test, expect } from '@playwright/test';
import { loginAndGetTenant, gotoAndVerify } from './e2e-utils';

test.describe('Control → Evidence Linking', () => {
    test.describe.configure({ mode: 'serial' });

    let tenantSlug: string;
    let controlDetailPath: string;
    const uniqueId = Date.now().toString(36);

    test('create control for evidence linking', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${tenantSlug}/controls/new`, '#control-name-input');

        await page.fill('#control-name-input', `Evidence Test ${uniqueId}`);
        await page.fill('#control-code-input', `EV-${uniqueId}`);
        await page.click('#create-control-btn');
        await page.waitForSelector('#control-title', { timeout: 60000 });
        await expect(page.locator('#control-title')).toContainText(`Evidence Test ${uniqueId}`);
        controlDetailPath = new URL(page.url()).pathname;
    });

    test('evidence tab starts empty', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(controlDetailPath);
        await page.waitForSelector('#control-title', { timeout: 15000 });

        await page.click('#tab-evidence');
        await expect(page.locator('#no-evidence')).toBeVisible({ timeout: 5000 });
    });

    test('link URL evidence from control context', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(controlDetailPath);
        await page.waitForSelector('#control-title', { timeout: 15000 });

        await page.click('#tab-evidence');
        await page.click('#link-evidence-btn');
        await page.fill('#evidence-url-input', 'https://example.com/evidence-doc');
        await page.fill('#evidence-note-input', `Test link ${uniqueId}`);
        await page.click('#submit-evidence-btn');

        // Evidence should appear in the table
        await expect(page.locator('#evidence-table')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('#evidence-table')).toContainText('LINK');
        await expect(page.locator('#evidence-table')).toContainText('https://example.com/evidence-doc');
    });

    test('upload evidence button is visible and opens form', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(controlDetailPath);
        await page.waitForSelector('#control-title', { timeout: 15000 });

        await page.click('#tab-evidence');
        await page.click('#upload-evidence-btn');
        await expect(page.locator('#control-upload-form')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#control-file-input')).toBeVisible();
        await expect(page.locator('#control-upload-title')).toBeVisible();
    });

    test('unlink evidence removes it from tab', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(controlDetailPath);
        await page.waitForSelector('#control-title', { timeout: 15000 });

        await page.click('#tab-evidence');
        await expect(page.locator('#evidence-table')).toBeVisible({ timeout: 10000 });

        // Count rows before
        const rowsBefore = await page.locator('#evidence-table tbody tr').count();
        expect(rowsBefore).toBeGreaterThan(0);

        // Click the first remove button
        const removeBtn = page.locator('#evidence-table tbody tr button').first();
        await removeBtn.click();

        // Wait for refetch — row count should decrease
        await expect(async () => {
            const rowsAfter = await page.locator('#evidence-table tbody tr').count();
            expect(rowsAfter).toBeLessThan(rowsBefore);
        }).toPass({ timeout: 15000 });
    });
});
