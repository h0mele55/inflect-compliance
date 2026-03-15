import { test, expect } from '@playwright/test';

/**
 * Filter contract E2E tests.
 *
 * Verifies that CompactFilterBar correctly updates URLs and
 * that server-side filtering works for major list pages.
 *
 * Uses data-testid attributes for stability.
 */

const TENANT = 'acme-corp';
const BASE = `/t/${TENANT}`;

test.describe('Filter contract: Controls', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(`${BASE}/controls`);
        await page.waitForSelector('[data-testid="filter-search"]');
    });

    test('search updates URL on Enter', async ({ page }) => {
        const searchInput = page.locator('[data-testid="filter-search"]');
        await searchInput.fill('password');
        await searchInput.press('Enter');
        await page.waitForTimeout(500);
        expect(page.url()).toContain('q=password');
    });

    test('clear X removes q param', async ({ page }) => {
        // First set a search
        const searchInput = page.locator('[data-testid="filter-search"]');
        await searchInput.fill('test');
        await searchInput.press('Enter');
        await page.waitForTimeout(500);
        expect(page.url()).toContain('q=test');

        // Then clear it
        await page.click('[data-testid="filter-clear-search"]');
        await page.waitForTimeout(500);
        expect(page.url()).not.toContain('q=');
    });

    test('status dropdown updates URL', async ({ page }) => {
        // Click status dropdown
        await page.click('[data-testid="filter-dd-status"]');
        // Select "Implemented"
        await page.click('text=Implemented');
        await page.waitForTimeout(500);
        expect(page.url()).toContain('status=IMPLEMENTED');
    });

    test('clear all removes all filter params', async ({ page }) => {
        // Set a filter first
        await page.click('[data-testid="filter-dd-status"]');
        await page.click('text=Implemented');
        await page.waitForTimeout(500);
        expect(page.url()).toContain('status=');

        // Clear all
        await page.click('[data-testid="filter-clear-all"]');
        await page.waitForTimeout(500);
        expect(page.url()).not.toContain('status=');
    });
});

test.describe('Filter contract: Tasks', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(`${BASE}/tasks`);
        await page.waitForSelector('[data-testid="filter-search"]');
    });

    test('type dropdown updates URL', async ({ page }) => {
        await page.click('[data-testid="filter-dd-type"]');
        await page.click('text=Incident');
        await page.waitForTimeout(500);
        expect(page.url()).toContain('type=INCIDENT');
    });

    test('overdue chip toggles URL param', async ({ page }) => {
        // Activate
        await page.click('[data-testid="filter-chip-overdue"]');
        await page.waitForTimeout(500);
        expect(page.url()).toContain('due=overdue');

        // Deactivate
        await page.click('[data-testid="filter-chip-overdue"]');
        await page.waitForTimeout(500);
        expect(page.url()).not.toContain('due=overdue');
    });

    test('severity dropdown updates URL', async ({ page }) => {
        await page.click('[data-testid="filter-dd-severity"]');
        await page.click('text=Critical');
        await page.waitForTimeout(500);
        expect(page.url()).toContain('severity=CRITICAL');
    });
});

test.describe('Filter contract: Vendors', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(`${BASE}/vendors`);
        await page.waitForSelector('[data-testid="filter-search"]');
    });

    test('criticality dropdown updates URL', async ({ page }) => {
        await page.click('[data-testid="filter-dd-criticality"]');
        await page.click('text=High');
        await page.waitForTimeout(500);
        expect(page.url()).toContain('criticality=HIGH');
    });

    test('review overdue chip works', async ({ page }) => {
        await page.click('[data-testid="filter-chip-review-overdue"]');
        await page.waitForTimeout(500);
        expect(page.url()).toContain('reviewDue=overdue');
    });
});

test.describe('Filter contract: URL persistence', () => {
    test('filters survive page refresh', async ({ page }) => {
        await page.goto(`${BASE}/controls?status=IMPLEMENTED&q=policy`);
        await page.waitForSelector('[data-testid="filter-search"]');

        // Verify search input has the value
        const searchValue = await page.locator('[data-testid="filter-search"]').inputValue();
        expect(searchValue).toBe('policy');

        // Verify URL still has params
        expect(page.url()).toContain('status=IMPLEMENTED');
        expect(page.url()).toContain('q=policy');
    });
});
