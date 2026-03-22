/**
 * E2E tests for AI-assisted risk assessment flow.
 * Uses the stub provider (AI_RISK_PROVIDER=stub or unset).
 */
import { test, expect, type Page } from '@playwright/test';

async function doLogin(page: Page) {
    await page.goto('/login');
    await page.waitForSelector('input[type="email"]', { timeout: 60000 });
    await page.fill('input[type="email"]', 'admin@acme.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/t\/[^/]+\/dashboard/, { timeout: 60000 });
}

test.describe('AI-Assisted Risk Assessment', () => {
    test.beforeEach(async ({ page }) => {
        await doLogin(page);
    });

    test('risks page has AI Assessment button', async ({ page }) => {
        await page.goto('/t/acme-corp/risks');
        await page.waitForSelector('#ai-risk-btn', { timeout: 15000 });
        await expect(page.locator('#ai-risk-btn')).toBeVisible();
        await expect(page.locator('#ai-risk-btn')).toContainText('AI Assessment');
    });

    test('navigates to AI assessment page and shows form', async ({ page }) => {
        await page.goto('/t/acme-corp/risks/ai');
        await page.waitForSelector('#ai-risk-title', { timeout: 15000 });
        await expect(page.locator('#ai-risk-title')).toContainText('AI-Assisted Risk Assessment');
        await expect(page.locator('#ai-generate-form')).toBeVisible();
        await expect(page.locator('#ai-generate-btn')).toBeVisible();
    });

    test('can select frameworks and generate suggestions', async ({ page }) => {
        await page.goto('/t/acme-corp/risks/ai');
        await page.waitForSelector('#ai-generate-form', { timeout: 15000 });

        // Select ISO27001 framework
        await page.click('#fw-iso27001');
        await expect(page.locator('#fw-iso27001')).toHaveClass(/bg-blue-600/);

        // Generate suggestions
        await page.click('#ai-generate-btn');

        // Wait for review section
        await page.waitForSelector('#ai-review-section', { timeout: 30000 });
        await expect(page.locator('#ai-review-section')).toBeVisible();

        // Should have suggestion cards
        await expect(page.locator('[id^="suggestion-"]').first()).toBeVisible();
    });

    test('can accept, reject, and apply suggestions', async ({ page }) => {
        await page.goto('/t/acme-corp/risks/ai');
        await page.waitForSelector('#ai-generate-form', { timeout: 15000 });

        // Generate
        await page.click('#fw-iso27001');
        await page.click('#ai-generate-btn');
        await page.waitForSelector('#ai-review-section', { timeout: 30000 });

        // Accept first suggestion
        await page.click('#accept-0');
        await expect(page.locator('#accepted-count')).toContainText('1 accepted');

        // Reject second suggestion
        await page.click('#reject-1');
        await expect(page.locator('#rejected-count')).toContainText('1 rejected');

        // Apply accepted
        await page.click('#apply-btn');

        // Wait for done phase
        await page.waitForSelector('#ai-done', { timeout: 15000 });
        await expect(page.locator('#ai-done')).toContainText('added to your register');
    });

    test('applied risk appears in risk register', async ({ page }) => {
        // First generate and apply
        await page.goto('/t/acme-corp/risks/ai');
        await page.waitForSelector('#ai-generate-form', { timeout: 15000 });
        await page.click('#fw-iso27001');
        await page.click('#ai-generate-btn');
        await page.waitForSelector('#ai-review-section', { timeout: 30000 });

        // Get title of first suggestion
        const firstTitle = await page.locator('#suggestion-0 h3').first().textContent();

        // Accept first, apply
        await page.click('#accept-0');
        await page.click('#apply-btn');
        await page.waitForSelector('#ai-done', { timeout: 15000 });

        // Navigate to risk register
        await page.click('#view-risks-btn');
        await page.waitForURL('**/risks', { timeout: 15000 });

        // Verify the risk is in the register
        if (firstTitle) {
            await expect(page.locator('body')).toContainText(firstTitle, { timeout: 10000 });
        }
    });

    test('dismiss session returns to form', async ({ page }) => {
        await page.goto('/t/acme-corp/risks/ai');
        await page.waitForSelector('#ai-generate-form', { timeout: 15000 });
        await page.click('#ai-generate-btn');
        await page.waitForSelector('#ai-review-section', { timeout: 30000 });

        // Dismiss
        await page.click('#dismiss-btn');

        // Should return to form
        await page.waitForSelector('#ai-generate-form', { timeout: 15000 });
        await expect(page.locator('#ai-generate-form')).toBeVisible();
    });
});
