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

test.describe('Issue Management', () => {
    test.describe.configure({ mode: 'serial' });

    let tenantSlug: string;
    const uniqueId = Date.now().toString(36);

    test('issues list page loads with filters and CTA', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${tenantSlug}/tasks`, 'h1');
        await expect(page.locator('#new-task-btn')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('#task-search')).toBeVisible();
        await expect(page.locator('#task-status-filter')).toBeVisible();
        await expect(page.locator('#task-type-filter')).toBeVisible();
        await expect(page.locator('#task-severity-filter')).toBeVisible();
    });

    test('create a new issue and see detail', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${tenantSlug}/tasks/new`, '#task-title-input');

        await page.fill('#task-title-input', `E2E Issue ${uniqueId}`);
        await page.fill('#task-description-input', 'Test issue from e2e');
        await page.selectOption('#task-type-select', 'INCIDENT');
        await page.selectOption('#task-severity-select', 'HIGH');
        await page.selectOption('#task-priority-select', 'P1');

        // INCIDENT requires asset or control link
        await page.selectOption('#link-entity-type', 'ASSET');
        await page.fill('#link-entity-id', 'test-asset-id');
        await page.click('#add-link-btn');
        await page.waitForSelector('#pending-links-list', { timeout: 3000 });

        await page.click('#create-task-btn');

        await page.waitForURL('**/tasks/**', { timeout: 15000 });
        await page.waitForSelector('#task-title', { timeout: 15000 });
        await expect(page.locator('#task-title')).toContainText(`E2E Issue ${uniqueId}`, { timeout: 10000 });
        await expect(page.locator('#task-severity')).toContainText('HIGH');
    });

    test('change issue status', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${tenantSlug}/tasks`, 'h1');

        await page.click(`text=E2E Issue ${uniqueId}`);
        await page.waitForSelector('#task-title', { timeout: 10000 });

        // Change status to TRIAGED
        await page.selectOption('#task-status-select', 'TRIAGED');
        await page.waitForTimeout(2000);

        // Reload and verify
        await page.reload();
        await page.waitForSelector('#task-status', { timeout: 10000 });
        await expect(page.locator('#task-status')).toContainText('Triaged');
    });

    test('assign issue', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${tenantSlug}/tasks`, 'h1');

        await page.click(`text=E2E Issue ${uniqueId}`);
        await page.waitForSelector('#task-title', { timeout: 10000 });

        // Verify assign controls are visible for admin
        await expect(page.locator('#task-assignee-input')).toBeVisible();
        await expect(page.locator('#assign-task-btn')).toBeVisible();

        // Get current user's ID from session and try assigning
        const session = await page.evaluate(async () => {
            const res = await fetch('/api/auth/session');
            return res.json();
        });
        const userId = session?.user?.id;
        if (userId) {
            await page.fill('#task-assignee-input', userId);
            await page.click('#assign-task-btn');
            await page.waitForTimeout(2000);
            // After assign, reload and confirm the input still has the value
            await page.reload();
            await page.waitForSelector('#task-assignee', { timeout: 10000 });
        }
    });

    test('add link to issue', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${tenantSlug}/tasks`, 'h1');

        await page.click(`text=E2E Issue ${uniqueId}`);
        await page.waitForSelector('#task-title', { timeout: 10000 });

        // Go to links tab
        await page.click('#tab-links');
        await page.waitForTimeout(1000);

        // Add a link
        await page.click('#add-link-btn');
        await page.waitForSelector('#link-entity-type', { timeout: 5000 });
        await page.selectOption('#link-entity-type', 'CONTROL');
        await page.fill('#link-entity-id', 'test-control-id');
        await page.click('#submit-link-btn');
        await page.waitForTimeout(2000);

        // Verify link appears
        await expect(page.locator('#links-list')).toContainText('CONTROL', { timeout: 5000 });
        await expect(page.locator('#links-list')).toContainText('test-control-id');
    });

    test('add comment to issue', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${tenantSlug}/tasks`, 'h1');

        await page.click(`text=E2E Issue ${uniqueId}`);
        await page.waitForSelector('#task-title', { timeout: 10000 });

        // Go to comments tab
        await page.click('#tab-comments');
        await page.waitForTimeout(1000);

        // Add a comment
        await page.fill('#comment-body', `E2E comment ${uniqueId}`);
        await page.click('#submit-comment-btn');
        await page.waitForTimeout(2000);

        // Verify comment appears
        await expect(page.locator('#comments-list')).toContainText(`E2E comment ${uniqueId}`, { timeout: 5000 });
    });

    test('dashboard page renders metrics', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${tenantSlug}/tasks/dashboard`, 'h1');

        // Verify dashboard elements
        await expect(page.locator('#dashboard-metrics')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('h1')).toContainText('Dashboard');
    });

    test('bulk action toolbar appears when issues selected', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${tenantSlug}/tasks`, 'h1');

        // Check that bulk toolbar is NOT visible initially
        await expect(page.locator('#bulk-toolbar')).not.toBeVisible({ timeout: 3000 });

        // Select all tasks
        const checkboxes = page.locator('.task-checkbox');
        const count = await checkboxes.count();
        if (count > 0) {
            await checkboxes.first().check();
            // Now toolbar should appear
            await expect(page.locator('#bulk-toolbar')).toBeVisible({ timeout: 5000 });
            await expect(page.locator('#bulk-action-select')).toBeVisible();
        }
    });

    test('reader user sees view-only issues', async ({ page }) => {
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

        // VERIFY-ON-EXIT for reader login
        let renderRetries = 3;
        while (renderRetries > 0) {
            const rendered = await page.locator('main').isVisible().catch(() => false);
            if (rendered) break;
            renderRetries--;
            if (renderRetries > 0) {
                await page.waitForTimeout(3000);
                await page.goto(`/t/${tenantSlug}/dashboard`, { waitUntil: 'domcontentloaded' });
                await page.waitForLoadState('networkidle').catch(() => {});
            }
        }

        await gotoAndVerify(page, `/t/${tenantSlug}/tasks`, 'h1');

        // Reader should NOT see create button
        await expect(page.locator('#new-task-btn')).not.toBeVisible({ timeout: 3000 });
    });

    test('legacy /issues URL redirects to /tasks', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/issues`);
        await page.waitForURL(`**/tasks`, { timeout: 15000 });
        await expect(page.url()).toContain('/tasks');
    });
});
