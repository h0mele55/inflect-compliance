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

test.describe('Policy Center', () => {
    test.describe.configure({ mode: 'serial' });

    let tenantSlug: string;
    let createdPolicyTitle: string;
    const uniqueId = Date.now().toString(36);

    test('policies list page loads with controls', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/policies`);
        await page.waitForSelector('h1', { timeout: 10000 });
        await expect(page.locator('#new-policy-btn')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#policy-from-template-btn')).toBeVisible();
        await expect(page.locator('#policy-search')).toBeVisible();
        await expect(page.locator('#policy-status-filter')).toBeVisible();
    });

    test('template library page loads', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/policies/templates`);
        await page.waitForSelector('h1', { timeout: 10000 });
        await expect(page.locator('h1')).toContainText('Policy Templates');
        await expect(page.locator('#template-search')).toBeVisible();
    });

    test('create a blank policy and see detail', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        createdPolicyTitle = `E2E Test Policy ${uniqueId}`;
        await page.goto(`/t/${tenantSlug}/policies/new`);
        await page.waitForSelector('#policy-title-input', { timeout: 10000 });

        await page.fill('#policy-title-input', createdPolicyTitle);
        await page.fill('#policy-content-input', '# Test Policy\n\nThis is a test policy created by e2e.');
        await page.click('#create-policy-btn');

        await page.waitForURL('**/policies/**', { timeout: 10000 });
        await expect(page.locator('#policy-title')).toContainText(createdPolicyTitle);
        await expect(page.locator('#policy-status')).toContainText('DRAFT');
    });

    test('create version via editor and view history', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/policies`);
        await page.waitForSelector('h1', { timeout: 10000 });
        await page.click(`text=${createdPolicyTitle}`);
        await page.waitForSelector('#policy-title', { timeout: 10000 });

        await page.click('#new-version-btn');
        await page.waitForSelector('#version-editor', { timeout: 5000 });

        await page.fill('#version-editor', '# Updated Policy\n\nVersion 2 of the policy.');
        await page.fill('#change-summary-input', 'Updated for e2e test');
        await page.click('#save-version-btn');

        await page.waitForSelector('#version-history', { timeout: 10000 });
        await expect(page.locator('#version-history')).toContainText('v2');
    });

    test('create external link version', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/policies`);
        await page.waitForSelector('h1', { timeout: 10000 });
        await page.click(`text=${createdPolicyTitle}`);
        await page.waitForSelector('#policy-title', { timeout: 10000 });

        // Open editor
        await page.click('#new-version-btn');
        await page.waitForSelector('#version-editor', { timeout: 5000 });

        // Switch to external link mode
        await page.click('#mode-external_link');
        await page.waitForSelector('#external-url-input', { timeout: 3000 });

        await page.fill('#external-url-input', 'https://docs.example.com/policy-v3');
        await page.fill('#change-summary-input', 'Added external doc link');
        await page.click('#save-version-btn');

        // Should show in version history
        await page.waitForSelector('#version-history', { timeout: 10000 });
        await expect(page.locator('#version-history')).toContainText('External Link');
    });

    test('activity feed tab loads', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/policies`);
        await page.waitForSelector('h1', { timeout: 10000 });
        await page.click(`text=${createdPolicyTitle}`);
        await page.waitForSelector('#policy-title', { timeout: 10000 });

        // Click Activity tab
        await page.click('text=Activity');
        await page.waitForSelector('#activity-feed', { timeout: 5000 });
        // Should show some events (at least POLICY_CREATED)
        await expect(page.locator('#activity-feed')).toContainText('CREATED');
    });

    test('policy detail shows role-gated action buttons', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/policies`);
        await page.waitForSelector('h1', { timeout: 10000 });

        // Find and click the created policy
        const policyLink = page.locator(`text=${createdPolicyTitle}`).first();
        await policyLink.waitFor({ timeout: 10000 });
        await policyLink.click();
        await page.waitForSelector('#policy-title', { timeout: 10000 });

        // Admin should see action buttons
        await expect(page.locator('#new-version-btn')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#archive-btn')).toBeVisible({ timeout: 5000 });
    });
});
