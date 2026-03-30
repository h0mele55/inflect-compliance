import { test, expect, Page } from '@playwright/test';
import { loginAndGetTenant as login, gotoAndVerify } from './e2e-utils';

/**
 * Responsive layout E2E tests.
 *
 * Verifies sidebar visibility, drawer behavior, and absence of
 * horizontal overflow across mobile and desktop viewports.
 *
 * Uses AUTH_TEST_MODE=1 (configured in playwright.config.ts webServer).
 */

const TEST_USER = { email: 'admin@acme.com', password: 'password123' };

/**
 * Check whether the page has horizontal overflow.
 * Returns true if NO overflow (page is healthy).
 */
async function hasNoHorizontalOverflow(page: Page): Promise<boolean> {
    return page.evaluate(() => {
        return document.documentElement.scrollWidth <= document.documentElement.clientWidth;
    });
}

// ─────────────────────── Mobile (375×812) ───────────────────────

test.describe('Mobile viewport (375×812)', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    let slug: string;

    test('sidebar hidden and hamburger visible', async ({ page }) => {
        slug = await login(page);
        await gotoAndVerify(page, `/t/${slug}/dashboard`, 'main');

        // Desktop sidebar should be hidden (display:none via md:flex)
        const sidebar = page.locator('aside');
        await expect(sidebar).toBeHidden();

        // Hamburger button should be visible
        const toggle = page.locator('[data-testid="nav-toggle"]');
        await expect(toggle).toBeVisible();
    });

    test('drawer opens and closes on nav click', async ({ page }) => {
        slug = await login(page);
        await gotoAndVerify(page, `/t/${slug}/dashboard`, 'main');

        // Open drawer
        await page.click('[data-testid="nav-toggle"]');
        const drawer = page.locator('[data-testid="nav-drawer"]');
        await expect(drawer).toBeVisible({ timeout: 3_000 });

        // Verify nav items are visible inside drawer
        await expect(drawer.locator('[data-testid="nav-dashboard"]')).toBeVisible();

        // Click a nav item — drawer should close
        await drawer.locator('[data-testid="nav-controls"]').click();
        await page.waitForURL(/\/controls/, { timeout: 10_000 });

        // Drawer should be closed — check data-open attribute
        await expect(drawer).toHaveAttribute('data-open', 'false', { timeout: 5_000 });
    });

    test('controls list has no horizontal overflow', async ({ page }) => {
        slug = await login(page);
        await gotoAndVerify(page, `/t/${slug}/controls`, 'h1');

        const noOverflow = await hasNoHorizontalOverflow(page);
        expect(noOverflow).toBe(true);
    });
});

// ─────────────────────── Desktop (1280×720) ───────────────────────

test.describe('Desktop viewport (1280×720)', () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    let slug: string;

    test('sidebar visible, no hamburger', async ({ page }) => {
        slug = await login(page);
        await gotoAndVerify(page, `/t/${slug}/dashboard`, 'aside');

        // Wait for CSS parsing and hydration to finalize layout
        await page.waitForLoadState('networkidle');

        // Desktop sidebar should be visible
        const sidebar = page.locator('aside');
        await expect(sidebar).toBeVisible({ timeout: 10000 });

        // Hamburger should be hidden on desktop (md:hidden)
        const toggle = page.locator('[data-testid="nav-toggle"]');
        await expect(toggle).toBeHidden();
    });

    test('controls page renders without horizontal overflow', async ({ page }) => {
        slug = await login(page);
        await gotoAndVerify(page, `/t/${slug}/controls`, 'h1');

        const noOverflow = await hasNoHorizontalOverflow(page);
        expect(noOverflow).toBe(true);
    });
});
