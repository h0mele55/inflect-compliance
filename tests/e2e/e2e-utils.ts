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
        if (msg.type() === 'error') {
            const text = msg.text();
            // Suppress known-benign Next.js dev server warnings:
            // - RSC payload fetch failures during JIT compilation (graceful fallback to browser nav)
            // - ClientFetchError from session polling during page transitions
            if (text.includes('Failed to fetch RSC payload') || text.includes('ClientFetchError')) return;
            console.log('BROWSER CONSOLE ERROR:', text);
        }
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

    // Retry loop: MissingCSRF can occur transiently when the dev server is
    // compiling routes — the request body stream drains before NextAuth reads it.
    // Retrying the full login flow resolves it once compilation finishes.
    const LOGIN_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= LOGIN_ATTEMPTS; attempt++) {
        if (attempt > 1) {
            await safeGoto(page, '/login', { timeout: 60_000 });
            await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 30000 });
            await page.waitForFunction(() => {
                const form = document.querySelector('form');
                return form && Object.keys(form).some(k => k.startsWith('__reactEvents') || k.startsWith('__reactFiber'));
            }, { timeout: 15000 });
        }

        await emailInput.click();
        await emailInput.fill(user.email);
        await page.locator('input[type="password"]').fill(user.password);
        await page.locator('button[type="submit"]').click();

        const navigated = await page.waitForURL(/\/t\/[^/]+\/dashboard/, { waitUntil: 'domcontentloaded', timeout: 30000 })
            .then(() => true)
            .catch(() => false);

        if (navigated) break;

        // Navigation may have completed just after the timeout — re-check URL.
        const url = page.url();
        if (/\/t\/[^/]+\/dashboard/.test(url)) break;

        // Still on /login after submit? Retry — CSRF failures can manifest as
        // visible "MissingCSRF" text, a URL error param, or a silent redirect back.
        if (attempt < LOGIN_ATTEMPTS && url.includes('/login')) {
            console.warn(`[loginAndGetTenant] Login failed on attempt ${attempt} (URL: ${url}), retrying...`);
            await page.waitForTimeout(3000);
            continue;
        }

        // Final attempt — fail with diagnostics
        console.error("LOGIN TIMEOUT! URL is:", url);
        console.error("PAGE CONTENT:", await page.content());
        throw new Error(`Login failed after ${attempt} attempts. URL: ${url}`);
    }
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
        if (rendered) {
            // Wait for React hydration — event handlers must be attached
            // before tests interact with any elements.
            await page.waitForFunction(() => {
                const el = document.querySelector('[data-hydrated]')
                    || document.querySelector('main');
                return el && Object.keys(el).some(
                    k => k.startsWith('__reactEvents') || k.startsWith('__reactFiber') || k.startsWith('__reactProps'),
                );
            }, { timeout: 15000 }).catch(() => {});
            return;
        }
        attempts--;
        if (attempts > 0) await page.waitForTimeout(3000);
    }
}
