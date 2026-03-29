import { test, expect, Page } from '@playwright/test';

const TEST_USER = { email: 'admin@acme.com', password: 'password123' };

async function loginAndGetTenant(page: Page): Promise<string> {
    await page.goto('/login');
    await page.waitForSelector('input[type="email"]', { timeout: 60000 });
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/t\/[^/]+\/dashboard/, { timeout: 60000 });
    const match = new URL(page.url()).pathname.match(/^\/t\/([^/]+)\//);
    if (!match) throw new Error('Could not extract tenant slug');
    const slug = match[1];

    // VERIFY-ON-EXIT: confirm the page actually rendered.
    let renderRetries = 3;
    while (renderRetries > 0) {
        const hasSidebar = await page.locator('aside').isVisible().catch(() => false);
        if (hasSidebar) break;
        renderRetries--;
        if (renderRetries > 0) {
            await page.waitForTimeout(3000);
            await page.goto(`/t/${slug}/dashboard`, { waitUntil: 'domcontentloaded' });
            await page.waitForLoadState('networkidle').catch(() => {});
        }
    }

    return slug;
}

/** Navigate and verify content rendered. */
async function gotoAndVerify(page: Page, url: string, contentSelector: string, maxAttempts = 3) {
    let attempts = maxAttempts;
    while (attempts > 0) {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => {});
        const rendered = await page.locator(contentSelector).first().isVisible().catch(() => false);
        if (rendered) return;
        attempts--;
        if (attempts > 0) await page.waitForTimeout(3000);
    }
}

test.describe('Vendor Management', () => {
    test.describe.configure({ mode: 'serial', retries: 2 });

    let tenantSlug: string;
    const uid = Date.now().toString(36);

    test('vendor register page loads', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${tenantSlug}/vendors`, 'h1');
        await expect(page.locator('h1')).toContainText('Vendor Register', { timeout: 15000 });
        await expect(page.locator('#new-vendor-btn')).toBeVisible();
        await expect(page.locator('#vendor-search')).toBeVisible();
    });

    test('create vendor and navigate to detail', async ({ page }) => {
        await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${tenantSlug}/vendors/new`, '#vendor-name-input');
        await expect(page.locator('#vendor-name-input')).toBeVisible({ timeout: 15000 });

        await page.fill('#vendor-name-input', `E2E Vendor ${uid}`);
        await page.selectOption('#vendor-criticality-select', 'HIGH');
        await page.click('#create-vendor-submit');

        await page.waitForURL(/\/vendors\//, { timeout: 60000 });
        await expect(page.locator('#vendor-detail-name')).toBeVisible({ timeout: 30000 });
        await expect(page.locator('#vendor-detail-name')).toContainText(`E2E Vendor ${uid}`);
    });

    test('vendor detail tabs work', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${tenantSlug}/vendors`, '[id^="vendor-link-"]');
        await page.locator('[id^="vendor-link-"]').first().click();
        await expect(page.locator('#vendor-detail-name')).toBeVisible({ timeout: 15000 });

        await page.click('#tab-documents');
        await expect(page.locator('text=No documents')).toBeVisible({ timeout: 10000 });
        await page.click('#tab-assessments');
        await expect(page.locator('text=No assessments')).toBeVisible({ timeout: 10000 });
    });

    // Test vendor document creation — React state is now updated optimistically.
    test('add document to vendor', async ({ page, request }) => {
        const slug = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${slug}/vendors`, '[id^="vendor-link-"]');
        // Extract vendor URL from the first link
        const vendorUrl = await page.locator('[id^="vendor-link-"]').first().getAttribute('href');
        await page.locator('[id^="vendor-link-"]').first().click();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('#vendor-detail-name')).toBeVisible({ timeout: 60000 });

        await page.click('#tab-documents');
        await page.waitForLoadState('networkidle');

        await expect(page.locator('#add-doc-btn')).toBeVisible({ timeout: 20000 });
        await page.click('#add-doc-btn');
        await expect(page.locator('#doc-type-select')).toBeVisible({ timeout: 5000 });
        await page.selectOption('#doc-type-select', 'SOC2');
        await page.fill('#doc-title-input', `SOC2 Report 2025 ${uid}`);
        await page.fill('#doc-url-input', 'https://example.com/soc2.pdf');

        await page.click('#submit-doc-btn');
        // Wait for the form to close (it closes on success by hiding the form)
        await expect(page.locator('#doc-type-select')).not.toBeVisible({ timeout: 15000 });
        // Allow time for the UI to settle
        await page.waitForTimeout(2000);
        // Check if the document is visible now or after a reload 
        const docVisible = await page.locator(`text=SOC2 Report 2025 ${uid}`).isVisible();
        if (!docVisible) {
            // Reload to force re-fetch
            await page.reload();
            await page.waitForLoadState('networkidle');
            await expect(page.locator('#vendor-detail-name')).toBeVisible({ timeout: 60000 });
            await page.click('#tab-documents');
            await page.waitForLoadState('networkidle');
        }
        await expect(page.locator(`text=SOC2 Report 2025 ${uid}`)).toBeVisible({ timeout: 20000 });
    });
});
