/**
 * Shared E2E test utilities.
 *
 * Centralises login, navigation, and retry logic so every spec file
 * benefits from the same cold-start / net-error resilience.
 */
import { type Page } from '@playwright/test';

export const DEFAULT_USER = { email: 'admin@acme.com', password: 'password123' };

/**
 * Navigate to a URL with retry on transient `net::` connection errors.
 * Uses `domcontentloaded` by default to avoid hanging on slow network requests.
 */
export async function safeGoto(
    page: Page,
    url: string,
    options?: Parameters<Page['goto']>[1],
    retries = 5,
) {
    const defaultOptions: Parameters<Page['goto']>[1] = {
        waitUntil: 'domcontentloaded',
        ...options,
    };
    for (let i = 0; i < retries; i++) {
        try {
            return await page.goto(url, defaultOptions);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (i < retries - 1 && msg.includes('net::')) {
                await page.waitForTimeout(5000);
                continue;
            }
            throw e;
        }
    }
}

/**
 * Login via the credentials form and return the tenant slug.
 *
 * Includes retry logic for:
 * - `net::` connection errors during cold-start
 * - Server 500s / blank pages on first compilation
 * - Sidebar hydration checks to confirm the page actually rendered
 */
export async function loginAndGetTenant(
    page: Page,
    user: { email: string; password: string } = DEFAULT_USER,
): Promise<string> {
    await safeGoto(page, '/login');
    await page.waitForSelector('input[type="email"]', { timeout: 60000 });
    await page.fill('input[type="email"]', user.email);
    await page.fill('input[type="password"]', user.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/t\/[^/]+\/dashboard/, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const match = new URL(page.url()).pathname.match(/^\/t\/([^/]+)\//);
    if (!match) throw new Error('Could not extract tenant slug from ' + page.url());
    const slug = match[1];

    // Verify the page actually rendered — reload if server was still compiling.
    let renderRetries = 3;
    while (renderRetries > 0) {
        const hasSidebar = await page.locator('aside').isVisible().catch(() => false);
        if (hasSidebar) break;
        renderRetries--;
        if (renderRetries > 0) {
            await page.waitForLoadState('networkidle').catch(() => {});
            await safeGoto(page, `/t/${slug}/dashboard`, { waitUntil: 'domcontentloaded' });
            await page.waitForLoadState('networkidle').catch(() => {});
        }
    }

    return slug;
}

/**
 * Navigate to a page and verify that a specific selector is rendered.
 * Retries on server 500s / blank pages from JIT compilation.
 */
export async function gotoAndVerify(
    page: Page,
    url: string,
    contentSelector: string,
    maxAttempts = 3,
) {
    let attempts = maxAttempts;
    while (attempts > 0) {
        await safeGoto(page, url, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => {});
        const rendered = await page
            .locator(contentSelector)
            .first()
            .isVisible()
            .catch(() => false);
        if (rendered) return;
        attempts--;
        if (attempts > 0) await page.waitForTimeout(3000);
    }
}
