/**
 * Epic 51 — light-mode activation smoke test.
 *
 * The light-mode tokens have been live since the Epic 51 finishing
 * pass. This test pins the round-trip:
 *
 *   1. First visit paints the dark theme (our SSR default).
 *   2. Clicking the sidebar theme toggle flips `html[data-theme]` to
 *      "light" and persists the choice to localStorage.
 *   3. Reloading the page restores the persisted theme instead of
 *      falling back to `prefers-color-scheme`.
 *
 * Visual regression (screenshot per page) is handled by the richer
 * Playwright runs; here we just verify the wiring.
 */

import { test, expect } from '@playwright/test';
import { loginAndGetTenant, safeGoto } from './e2e-utils';

const ADMIN_USER = { email: 'admin@acme.com', password: 'password123' };

test.describe('Epic 51 — theme toggle', () => {
    test('flips html[data-theme] between dark and light and persists across reload', async ({
        page,
    }) => {
        // Pin the starting theme to dark regardless of the chromium
        // default `prefers-color-scheme` (Playwright emulates it as
        // "light" on this host). Only set the key when it's not
        // already present so a later toggle to "light" doesn't get
        // overwritten by the initScript on page reload.
        await page.context().addInitScript(() => {
            try {
                if (!window.localStorage.getItem('inflect:theme')) {
                    window.localStorage.setItem('inflect:theme', 'dark');
                }
            } catch {
                /* storage not available; fall through to SSR default */
            }
        });

        const tenantSlug = await loginAndGetTenant(page, ADMIN_USER);

        await safeGoto(page, `/t/${tenantSlug}/dashboard`, {
            waitUntil: 'domcontentloaded',
        });
        await page.waitForLoadState('networkidle').catch(() => {});

        // SSR baseline is dark.
        const initialTheme = await page.evaluate(
            () => document.documentElement.dataset.theme,
        );
        expect(initialTheme).toBe('dark');

        // Toggle on the existing theme-toggle button (installed in the
        // sidebar by Epic 51). The app renders the sidebar twice — once
        // inside the desktop <aside> and a clone inside a mobile
        // nav-drawer dialog — so we scope to the unique #id rather than
        // the data-testid.
        // Two elements share #theme-toggle-desktop: the desktop <aside>
        // sidebar and a clone rendered inside the mobile nav-drawer
        // <dialog>. Scope to the desktop sidebar via its accessible
        // landmark.
        const toggle = page.getByRole('complementary').locator('#theme-toggle-desktop');
        await toggle.waitFor({ state: 'visible', timeout: 30000 });
        await toggle.click();

        await expect
            .poll(() =>
                page.evaluate(() => document.documentElement.dataset.theme),
            )
            .toBe('light');

        // Persistence: the toggle writes to localStorage.
        const stored = await page.evaluate(() =>
            window.localStorage.getItem('inflect:theme'),
        );
        expect(stored).toBe('light');

        // Reload and confirm the stored theme is restored rather than
        // falling back to prefers-color-scheme.
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect
            .poll(() =>
                page.evaluate(() => document.documentElement.dataset.theme),
            )
            .toBe('light');

        // Toggle back to dark — leaves the environment in the state
        // other tests expect.
        const toggleAgain = page.getByRole('complementary').locator('#theme-toggle-desktop');
        await toggleAgain.waitFor({ state: 'visible', timeout: 10000 });
        await toggleAgain.click();
        await expect
            .poll(() =>
                page.evaluate(() => document.documentElement.dataset.theme),
            )
            .toBe('dark');
    });
});
