import { test, expect, Page } from '@playwright/test';

const TEST_USER = { email: 'admin@acme.com', password: 'password123' };

async function loginAndGetTenant(page: Page): Promise<string> {
    await page.goto('/login');
    await page.waitForSelector('input[type="email"]', { timeout: 30000 });
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/t\/[^/]+\/dashboard/, { timeout: 15000 });
    const url = new URL(page.url());
    const match = url.pathname.match(/^\/t\/([^/]+)\//);
    if (!match) throw new Error('Could not extract tenant slug from ' + url.pathname);
    return match[1];
}

test.describe('Controls Center', () => {
    test.describe.configure({ mode: 'serial' });

    let tenantSlug: string;
    const uniqueId = Date.now().toString(36);

    test('controls list page loads with filters and CTAs', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForSelector('h1', { timeout: 10000 });
        await expect(page.locator('#new-control-btn')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#install-templates-btn')).toBeVisible();
        await expect(page.locator('#control-search')).toBeVisible();
        await expect(page.locator('#control-status-filter')).toBeVisible();
    });

    test('create a new control and see detail', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/controls/new`);
        await page.waitForSelector('#control-name-input', { timeout: 10000 });

        await page.fill('#control-name-input', `E2E Control ${uniqueId}`);
        await page.fill('#control-code-input', `CTRL-${uniqueId}`);
        await page.fill('#control-description-input', 'Test control from e2e');
        await page.click('#create-control-btn');

        await page.waitForURL('**/controls/**', { timeout: 10000 });
        await expect(page.locator('#control-title')).toContainText(`E2E Control ${uniqueId}`, { timeout: 5000 });
        await expect(page.locator('#control-status')).toBeVisible();
    });

    test('open control → create task → mark done', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForSelector('h1', { timeout: 10000 });

        // Click on the control we created
        await page.click(`text=E2E Control ${uniqueId}`);
        await page.waitForSelector('#control-title', { timeout: 10000 });

        // Go to tasks tab
        await page.click('#tab-tasks');
        await page.waitForSelector('#create-task-btn', { timeout: 5000 });

        // Create task
        await page.click('#create-task-btn');
        await page.waitForSelector('#task-title-input', { timeout: 5000 });
        await page.fill('#task-title-input', `E2E Task ${uniqueId}`);
        await page.click('#submit-task-btn');

        // Verify task appears
        await expect(page.locator('#tasks-table')).toContainText(`E2E Task ${uniqueId}`, { timeout: 5000 });

        // Mark done
        const doneBtn = page.locator('button:has-text("Done")').first();
        await doneBtn.click();
        await expect(page.locator('#tasks-table')).toContainText('DONE', { timeout: 5000 });
    });

    test('attach evidence → see it listed', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForSelector('h1', { timeout: 10000 });

        await page.click(`text=E2E Control ${uniqueId}`);
        await page.waitForSelector('#control-title', { timeout: 10000 });

        // Go to evidence tab
        await page.click('#tab-evidence');
        await page.waitForSelector('#link-evidence-btn', { timeout: 5000 });

        // Link evidence
        await page.click('#link-evidence-btn');
        await page.waitForSelector('#evidence-url-input', { timeout: 5000 });
        await page.fill('#evidence-url-input', 'https://docs.example.com/evidence-report');
        await page.fill('#evidence-note-input', 'E2E evidence note');
        await page.click('#submit-evidence-btn');

        // Verify evidence appears
        await expect(page.locator('#evidence-table')).toContainText('docs.example.com', { timeout: 5000 });
    });

    test('mark NOT_APPLICABLE requires justification', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForSelector('h1', { timeout: 10000 });

        await page.click(`text=E2E Control ${uniqueId}`);
        await page.waitForSelector('#control-title', { timeout: 10000 });

        // Click applicability toggle
        await page.click('#toggle-applicability-btn');
        await page.waitForSelector('input[value="NOT_APPLICABLE"]', { timeout: 5000 });

        // Select Not Applicable
        await page.click('input[value="NOT_APPLICABLE"]');
        await page.waitForSelector('#applicability-justification', { timeout: 3000 });

        // Try to save without justification -> button should be disabled
        const saveBtn = page.locator('#save-applicability-btn');
        await expect(saveBtn).toBeDisabled();

        // Fill justification and save
        await page.fill('#applicability-justification', 'Not in scope for this compliance cycle');
        await expect(saveBtn).toBeEnabled();
        await saveBtn.click();

        // Verify N/A badge
        await expect(page.locator('#control-applicability')).toContainText('Not Applicable', { timeout: 5000 });
    });

    test('reader user sees view-only controls', async ({ page }) => {
        // Login as reader
        await page.goto('/login');
        await page.waitForSelector('input[type="email"]', { timeout: 30000 });
        await page.fill('input[type="email"]', 'viewer@acme.com');
        await page.fill('input[type="password"]', 'password123');
        await page.click('button[type="submit"]');
        await page.waitForURL(/\/t\/[^/]+\/dashboard/, { timeout: 15000 });
        const url = new URL(page.url());
        const match = url.pathname.match(/^\/t\/([^/]+)\//);
        tenantSlug = match?.[1] || tenantSlug;

        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForSelector('h1', { timeout: 10000 });

        // Reader should NOT see create buttons
        await expect(page.locator('#new-control-btn')).not.toBeVisible({ timeout: 3000 });
        await expect(page.locator('#install-templates-btn')).not.toBeVisible({ timeout: 3000 });
    });
});
