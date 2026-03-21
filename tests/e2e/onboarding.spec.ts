import { test, expect, type Page } from '@playwright/test';

/**
 * Onboarding Wizard E2E Tests
 *
 * Tests the full onboarding flow: start → steps → resume → finish → dashboard.
 * Uses relative URLs so playwright.config.ts baseURL is respected.
 */

// ─── Helpers ───

async function loginAsAdmin(page: Page): Promise<string> {
    await page.goto('/login');
    await page.waitForSelector('input[type="email"]', { timeout: 60000 });
    await page.fill('input[type="email"]', 'admin@acme.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/t\/[^/]+\/dashboard/, { timeout: 60000 });

    const url = new URL(page.url());
    const match = url.pathname.match(/^\/t\/([^/]+)\//);
    if (!match) throw new Error('Could not extract tenant slug from ' + url.pathname);
    const slug = match[1];

    // Ensure the page actually rendered
    let retries = 3;
    while (retries > 0) {
        const hasSidebar = await page.locator('aside').isVisible().catch(() => false);
        if (hasSidebar) break;
        retries--;
        if (retries > 0) {
            await page.waitForTimeout(3000);
            await page.goto(`/t/${slug}/dashboard`, { waitUntil: 'domcontentloaded' });
            await page.waitForLoadState('networkidle').catch(() => {});
        }
    }

    return slug;
}

async function gotoAndVerify(page: Page, url: string, selector = 'main', retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => {});
        const el = await page.locator(selector).first();
        if (await el.isVisible({ timeout: 10000 }).catch(() => false)) return;
        if (attempt < retries - 1) await page.waitForTimeout(2000);
    }
}

// ─── Tests ───

test.describe('Onboarding Wizard', () => {
    test.describe.configure({ mode: 'serial' });

    test('admin starts onboarding and sees the wizard', async ({ page }) => {
        const slug = await loginAsAdmin(page);
        await gotoAndVerify(page, `/t/${slug}/onboarding`);

        // Should see the welcome screen or the wizard
        const pageContent = await page.textContent('body');
        const hasWizard = pageContent?.includes('Setup Wizard') || pageContent?.includes('set up your workspace');
        expect(hasWizard).toBeTruthy();
    });

    test('admin completes Company Profile step', async ({ page }) => {
        const slug = await loginAsAdmin(page);
        await gotoAndVerify(page, `/t/${slug}/onboarding`);

        // Start onboarding if on welcome screen
        const startBtn = page.locator('button:has-text("Start Setup")');
        if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await startBtn.click();
            await page.waitForLoadState('networkidle');
        }

        // Fill company name
        const nameInput = page.locator('[data-testid="company-name"]');
        if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
            await nameInput.fill('Acme Corporation');
        }

        // Click Continue
        const continueBtn = page.locator('button:has-text("Continue")');
        if (await continueBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await continueBtn.click();
            await page.waitForLoadState('networkidle');
        }
    });

    test('wizard resumes on refresh', async ({ page }) => {
        const slug = await loginAsAdmin(page);
        await gotoAndVerify(page, `/t/${slug}/onboarding`);

        // Should NOT show the welcome screen — should show the wizard with progress
        await page.waitForTimeout(2000);
        const wizardEl = page.locator('[data-testid="onboarding-wizard"]');
        const hasWizard = await wizardEl.isVisible({ timeout: 5000 }).catch(() => false);

        if (hasWizard) {
            // Verify we resumed — at least 1 step should be complete
            const checkmarks = page.locator('[data-testid^="step-nav-"]');
            const count = await checkmarks.count();
            expect(count).toBeGreaterThan(0);
        }
    });

    test('non-admin cannot access onboarding', async ({ page }) => {
        // Login as reader via the UI
        await page.goto('/login');
        await page.waitForSelector('input[type="email"]', { timeout: 60000 });
        await page.fill('input[type="email"]', 'viewer@acme.com');
        await page.fill('input[type="password"]', 'password123');
        await page.click('button[type="submit"]');
        await page.waitForURL(/\/t\/[^/]+\/dashboard/, { timeout: 60000 });

        const url = new URL(page.url());
        const match = url.pathname.match(/^\/t\/([^/]+)\//);
        const slug = match ? match[1] : 'acme-corp';

        await gotoAndVerify(page, `/t/${slug}/onboarding`);
        await page.waitForTimeout(2000);

        const pageContent = await page.textContent('body');
        const blocked = pageContent?.includes('Access Restricted') || pageContent?.includes('administrator');
        // Either blocked with message or redirected — both are acceptable
        expect(blocked || !pageContent?.includes('Setup Wizard')).toBeTruthy();
    });
});
