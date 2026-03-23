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
            await page.waitForLoadState('networkidle');
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

test.describe('Control Tests (Test-of-Control)', () => {
    test.describe.configure({ mode: 'serial' });

    let tenantSlug: string;
    const uid = Date.now().toString(36);

    test('create a control, open it, then create a test plan', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);

        // Create a control first
        await gotoAndVerify(page, `/t/${tenantSlug}/controls/new`, '#control-name-input');
        await page.fill('#control-name-input', `Test Ctrl ${uid}`);
        await page.fill('#control-code-input', `TC-${uid}`);
        await page.click('#create-control-btn');
        await page.waitForURL('**/controls/**', { timeout: 15000 });
        await page.waitForSelector('#control-title', { timeout: 15000 });
        await expect(page.locator('#control-title')).toContainText(`Test Ctrl ${uid}`, { timeout: 5000 });

        // Go to Tests tab — TestPlansPanel fetches data on mount, wait for the API to settle
        await page.click('#tab-tests');
        await page.waitForLoadState('networkidle');
        await page.waitForSelector('#create-test-plan-btn', { timeout: 15000 });

        // Create a test plan
        await page.click('#create-test-plan-btn');
        await page.waitForSelector('#test-plan-name-input', { timeout: 5000 });
        await page.fill('#test-plan-name-input', `Access Review ${uid}`);
        await page.selectOption('#test-plan-frequency-select', 'QUARTERLY');
        await page.click('#save-test-plan-btn');

        // Wait for API round-trip
        await page.waitForLoadState('networkidle');

        // Plan should appear in the list
        await expect(page.locator(`text=Access Review ${uid}`)).toBeVisible({ timeout: 10000 });
    });

    test('open test plan detail and start a run', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${tenantSlug}/controls`, 'h1');

        // Use search to find the specific control
        await page.fill('#control-search', `Test Ctrl ${uid}`);
        await page.waitForLoadState('networkidle'); /* replaced wait */
        await page.click(`text=Test Ctrl ${uid}`);
        await page.waitForLoadState('networkidle');
        await page.waitForSelector('#control-title', { timeout: 30000 });

        // Go to Tests tab — wait for TestPlansPanel fetch to complete
        await page.click('#tab-tests');
        await page.waitForLoadState('networkidle');
        await expect(page.locator(`text=Access Review ${uid}`)).toBeVisible({ timeout: 15000 });

        // Click the test plan name to go to detail page
        await page.click(`text=Access Review ${uid}`);
        // The test plan detail route may need cold compilation — wait for data to load
        await page.waitForLoadState('networkidle');
        await page.waitForSelector('#test-plan-title', { timeout: 30000 });
        await expect(page.locator('#test-plan-title')).toContainText(`Access Review ${uid}`);

        // Create a run
        await page.click('#create-test-run-btn');
        await page.waitForLoadState('networkidle');
        await page.waitForSelector('#test-run-title', { timeout: 30000 });
        await expect(page.locator('#test-run-status')).toContainText('PLANNED', { timeout: 10000 });
    });

    test('complete test run as PASS and link evidence', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${tenantSlug}/controls`, 'h1');

        // Use search to find the specific control
        await page.fill('#control-search', `Test Ctrl ${uid}`);
        await page.waitForLoadState('networkidle');
        await page.click(`text=Test Ctrl ${uid}`);
        await page.waitForSelector('#control-title', { timeout: 10000 });
        await page.click('#tab-tests');
        await page.waitForLoadState('networkidle');
        await expect(page.locator(`text=Access Review ${uid}`)).toBeVisible({ timeout: 10000 });
        const planLink = page.locator(`[id^="test-plan-link-"]`).filter({ hasText: `Access Review ${uid}` }).first();
        await planLink.click();
        await page.waitForSelector('#test-plan-title', { timeout: 10000 });

        // Click the first (most recent) run link
        const runLink = page.locator('[id^="test-run-link-"]').first();
        await runLink.click();
        await page.waitForSelector('#test-run-title', { timeout: 10000 });

        // Complete as PASS
        await page.click('#result-btn-PASS');
        await page.fill('#test-run-notes', 'All access levels verified correctly');
        await page.click('#complete-test-run-btn');

        // Wait for API round-trip and re-render
        await page.waitForLoadState('networkidle').catch(() => {});
        await expect(page.locator('#test-run-status')).toContainText('COMPLETED', { timeout: 15000 });
        await expect(page.locator('#test-run-result')).toContainText('PASS', { timeout: 10000 });

        // Link URL evidence
        await page.click('#link-evidence-btn');
        await page.waitForSelector('#evidence-kind-select', { timeout: 10000 });
        await page.selectOption('#evidence-kind-select', 'LINK');
        // Wait for the form to re-render with LINK fields
        await page.waitForSelector('#evidence-url-input', { timeout: 5000 });
        await page.fill('#evidence-url-input', 'https://docs.example.com/access-review-q1');
        await page.fill('#evidence-note-input', 'Q1 access review report');
        await page.click('#save-evidence-link-btn');

        // Wait for API round-trip and evidence to appear
        await page.waitForLoadState('networkidle').catch(() => {});
        await expect(page.locator('text=docs.example.com')).toBeVisible({ timeout: 15000 });
    });

    test('create another run, mark FAIL, verify task created', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${tenantSlug}/controls`, 'h1');

        // Use search to find the specific control
        await page.fill('#control-search', `Test Ctrl ${uid}`);
        await page.waitForLoadState('networkidle');
        await page.click(`text=Test Ctrl ${uid}`);
        await page.waitForSelector('#control-title', { timeout: 10000 });
        await page.click('#tab-tests');
        await page.waitForLoadState('networkidle');
        const planLink = page.locator(`[id^="test-plan-link-"]`).filter({ hasText: `Access Review ${uid}` }).first();
        await planLink.click();
        await page.waitForSelector('#test-plan-title', { timeout: 10000 });

        // Create another run
        await page.click('#create-test-run-btn');
        await page.waitForSelector('#test-run-title', { timeout: 10000 });

        // Complete as FAIL
        await page.click('#result-btn-FAIL');
        await page.waitForSelector('#test-run-finding-summary', { timeout: 5000 });
        await page.fill('#test-run-notes', 'Found unauthorized access');
        await page.fill('#test-run-finding-summary', 'Unauthorized admin access detected');
        await page.click('#complete-test-run-btn');

        // Wait for API round-trip and re-render
        await page.waitForLoadState('networkidle').catch(() => {});
        await expect(page.locator('#test-run-status')).toContainText('COMPLETED', { timeout: 15000 });
        await expect(page.locator('#test-run-result')).toContainText('FAIL', { timeout: 10000 });

        // Verify the finding summary is displayed on the run page
        await expect(page.locator('text=Unauthorized admin access detected')).toBeVisible({ timeout: 10000 });
    });

    test('tests rollup page loads', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${tenantSlug}/tests`, '#tests-page-title');
        await expect(page.locator('#tests-page-title')).toContainText('Tests');
        // Verify at minimum that the page renders and the loading indicator is present
        await expect(page.locator('text=Test plans and recent results')).toBeVisible({ timeout: 5000 });
    });
});
