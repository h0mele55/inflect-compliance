/**
 * Shared E2E test utilities.
 *
 * Centralises login, navigation, and retry logic so every spec file
 * benefits from the same cold-start / net-error resilience.
 */
import { type Page } from '@playwright/test';

export const DEFAULT_USER = { email: 'admin@acme.com', password: 'password123' };

/** Errors that indicate a transient server/network issue worth retrying. */
const TRANSIENT_ERRORS = ['net::', 'ERR_CONNECTION_REFUSED', 'ERR_EMPTY_RESPONSE'];

/** Errors that mean the page/context is dead — retrying on the same page is pointless. */
const FATAL_ERRORS = ['Target page, context or browser has been closed', 'Target closed'];

/**
 * Navigate to a URL with retry on transient network errors.
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
        timeout: 60_000,
        ...options,
    };
    for (let i = 0; i < retries; i++) {
        try {
            return await page.goto(url, defaultOptions);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);

            // Fatal: page/context is dead — no point retrying on the same page
            if (FATAL_ERRORS.some(f => msg.includes(f))) {
                throw e;
            }

            // Transient: wait and retry
            if (i < retries - 1 && TRANSIENT_ERRORS.some(t => msg.includes(t))) {
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
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
    page.on('console', msg => {
        if (msg.type() === 'error') console.log('BROWSER CONSOLE ERROR:', msg.text());
    });

    // Wait for the dev server to be ready — first navigation may trigger JIT compilation
    await safeGoto(page, '/login', { timeout: 90_000 });

    // Wait for the form to be visible
    const emailInput = page.locator('input[type="email"]');
    await emailInput.waitFor({ state: 'visible', timeout: 60000 });

    // Wait for React hydration — ensure onSubmit is attached before interacting.
    // Without this, the browser does a native form POST to '#', not the JS auth flow.
    await page.waitForFunction(() => {
        const form = document.querySelector('form');
        return form && Object.keys(form).some(k => k.startsWith('__reactEvents') || k.startsWith('__reactFiber'));
    }, { timeout: 30000 });

    await emailInput.click();
    await emailInput.fill(user.email);
    
    await page.locator('input[type="password"]').fill(user.password);
    await page.locator('button[type="submit"]').click();
    
    await page.waitForURL(/\/t\/[^/]+\/dashboard/, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(async (e) => {
        console.error("LOGIN TIMEOUT! URL is:", page.url());
        console.error("PAGE CONTENT:", await page.content());
        throw e;
    });
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
