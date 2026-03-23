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

test.describe('Controls Enhanced', () => {
    test.describe.configure({ mode: 'serial' });

    let tenantSlug: string;

    test('dashboard loads and shows metrics', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        // Dev server may return 500 on first load while compiling
        let retries = 2;
        while (retries > 0) {
            const resp = await page.goto(`/t/${tenantSlug}/controls/dashboard`);
            if (resp && resp.status() < 500) break;
            retries--;
            if (retries > 0) await page.waitForTimeout(3000);
        }
        await page.waitForLoadState('networkidle');
        await page.waitForSelector('#dashboard-heading', { timeout: 30000 });
        await expect(page.locator('#dashboard-heading')).toContainText('Controls Dashboard');
        await expect(page.locator('#implementation-progress')).toBeVisible();
        await expect(page.locator('#dashboard-stats')).toBeVisible();
    });

    test('mark test completed updates last tested', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);

        // First create a control to test with
        let r2 = 2;
        while (r2 > 0) {
            const resp = await page.goto(`/t/${tenantSlug}/controls/new`);
            if (resp && resp.status() < 500) break;
            r2--;
            if (r2 > 0) await page.waitForTimeout(3000);
        }
        await page.waitForSelector('#control-name-input', { timeout: 15000 });
        const uniqueId = Date.now().toString(36);
        await page.fill('#control-name-input', `Cadence Test ${uniqueId}`);
        await page.fill('#control-code-input', `CAD-${uniqueId}`);
        await page.click('#create-control-btn');
        await page.waitForURL('**/controls/**', { timeout: 15000 });
        await page.waitForSelector('#control-title', { timeout: 15000 });
        await expect(page.locator('#control-title')).toContainText(`Cadence Test ${uniqueId}`, { timeout: 10000 });

        // Click "Mark Test Completed"
        await page.click('#mark-test-completed-btn');
        await page.waitForTimeout(2000);

        // Verify overview tab shows last tested date
        await page.click('#tab-overview');
        await expect(page.locator('text=Last Tested')).toBeVisible();
    });

    test('activity tab shows events', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForLoadState('networkidle');
        await page.waitForSelector('h1', { timeout: 15000 });

        // Click any control
        const firstControl = page.locator('#controls-table tbody tr a').first();
        if (await firstControl.isVisible()) {
            await firstControl.click();
            await page.waitForSelector('#control-title', { timeout: 10000 });

            // Click activity tab and wait for data to load
            await page.click('#tab-activity');
            await page.waitForLoadState('networkidle');

            // Wait for either the activity feed or the empty state to appear
            await Promise.race([
                page.waitForSelector('#activity-feed', { timeout: 15000 }).catch(() => null),
                page.waitForSelector('text=No activity recorded', { timeout: 15000 }).catch(() => null),
            ]);

            // Should show activity feed (at least for controls that have events)
            const hasActivity = await page.locator('#activity-feed').isVisible();
            const hasNoActivity = await page.locator('text=No activity recorded').isVisible();
            expect(hasActivity || hasNoActivity).toBe(true);
        }
    });

    test('automation section is visible on detail page', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForLoadState('networkidle');
        await page.waitForSelector('h1', { timeout: 15000 });

        const firstControl = page.locator('#controls-table tbody tr a').first();
        if (await firstControl.isVisible()) {
            await firstControl.click();
            await page.waitForLoadState('networkidle');
            await page.waitForSelector('#control-title', { timeout: 30000 });

            // Should see automation section in overview
            await expect(page.getByRole('heading', { name: 'Automation' })).toBeVisible({ timeout: 15000 });
            await expect(page.locator('#edit-automation-btn')).toBeVisible();
        }
    });
});
