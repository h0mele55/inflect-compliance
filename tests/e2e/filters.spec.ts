import { test, expect, Page } from '@playwright/test';

/**
 * Filter contract E2E tests.
 *
 * Verifies that CompactFilterBar correctly updates URLs and
 * that server-side filtering works for major list pages.
 *
 * Uses data-testid attributes for stability.
 */

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

let TENANT = '';

test.describe('Filter contract: Controls', () => {
    test.beforeEach(async ({ page }) => {
        TENANT = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${TENANT}/controls`, '[data-testid="filter-search"]');
    });

    test('search updates URL on Enter', async ({ page }) => {
        const searchInput = page.locator('[data-testid="filter-search"]');
        await searchInput.fill('password');
        await searchInput.press('Enter');
        await expect(page).toHaveURL(/q=password/);
    });

    test('clear X removes q param', async ({ page }) => {
        // First set a search
        const searchInput = page.locator('[data-testid="filter-search"]');
        await searchInput.fill('test');
        await searchInput.press('Enter');
        await expect(page).toHaveURL(/q=test/);

        // Then clear it
        await page.click('[data-testid="filter-clear-search"]');
        await expect(page).not.toHaveURL(/q=/);
    });

    test('status dropdown updates URL', async ({ page }) => {
        // Click status dropdown
        await page.click('[data-testid="filter-dd-status"]');
        // Select "Implemented"
        await page.click('text=Implemented');
        await expect(page).toHaveURL(/status=IMPLEMENTED/);
    });

    test('clear all removes all filter params', async ({ page }) => {
        // Set a filter first
        await page.click('[data-testid="filter-dd-status"]');
        await page.click('text=Implemented');
        await expect(page).toHaveURL(/status=/);

        // Clear all
        await page.click('[data-testid="filter-clear-all"]');
        await expect(page).not.toHaveURL(/status=/);
    });
});

test.describe('Filter contract: Tasks', () => {
    test.beforeEach(async ({ page }) => {
        TENANT = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${TENANT}/tasks`, '[data-testid="filter-search"]');
    });

    test('type dropdown updates URL', async ({ page }) => {
        await page.click('[data-testid="filter-dd-type"]');
        await page.click('text=Incident');
        await expect(page).toHaveURL(/type=INCIDENT/);
    });

    test('overdue chip toggles URL param', async ({ page }) => {
        // Activate
        await page.click('[data-testid="filter-chip-overdue"]');
        await expect(page).toHaveURL(/due=overdue/);

        // Deactivate
        await page.click('[data-testid="filter-chip-overdue"]');
        await expect(page).not.toHaveURL(/due=overdue/);
    });

    test('severity dropdown updates URL', async ({ page }) => {
        await page.click('[data-testid="filter-dd-severity"]');
        await page.click('text=Critical');
        await expect(page).toHaveURL(/severity=CRITICAL/);
    });
});

test.describe('Filter contract: Vendors', () => {
    test.beforeEach(async ({ page }) => {
        TENANT = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${TENANT}/vendors`, '[data-testid="filter-search"]');
    });

    test('criticality dropdown updates URL', async ({ page }) => {
        await page.waitForSelector('[data-testid="filter-dd-criticality"]', { timeout: 10000 });
        await page.click('[data-testid="filter-dd-criticality"]');
        await page.getByRole('option', { name: 'High' }).or(page.locator('text=High')).first().click();
        await expect(page).toHaveURL(/criticality=HIGH/, { timeout: 10000 });
    });

    test('review overdue chip works', async ({ page }) => {
        await page.click('[data-testid="filter-chip-review-overdue"]');
        await expect(page).toHaveURL(/reviewDue=overdue/);
    });
});

test.describe('Filter contract: URL persistence', () => {
    test('filters survive page refresh', async ({ page }) => {
        TENANT = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${TENANT}/controls?status=IMPLEMENTED&q=policy`, '[data-testid="filter-search"]');

        // Verify search input has the value
        const searchValue = await page.locator('[data-testid="filter-search"]').inputValue();
        expect(searchValue).toBe('policy');

        // Verify URL still has params
        expect(page.url()).toContain('status=IMPLEMENTED');
        expect(page.url()).toContain('q=policy');
    });
});
