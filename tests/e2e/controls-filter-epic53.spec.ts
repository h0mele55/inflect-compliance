import { test, expect } from '@playwright/test';
import { loginAndGetTenant, safeGoto } from './e2e-utils';

/**
 * Epic 53 E2E — Controls page on the new enterprise filter system.
 *
 * Exercises the observable migration contract:
 *   1. The free-text `#control-search` input still drives the `q` URL param.
 *   2. The consolidated FilterSelect picker opens, drills into a filter, and
 *      applies a value that lands in the URL.
 *   3. Clear-all wipes active filters from the URL without breaking the page.
 *   4. Empty-state copy renders when a filter matches nothing.
 *
 * Tenant safety: we read/assert URLs scoped under `/t/{slug}/controls` and
 * exercise real API calls — no filter-state mocking.
 */

test.describe('Controls — Epic 53 filter system', () => {
    test.describe.configure({ mode: 'serial' });

    let tenantSlug: string;

    test('search input writes q param to the URL on Enter', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/controls`);
        await page.waitForLoadState('networkidle');

        const search = page.locator('#control-search');
        await expect(search).toBeVisible({ timeout: 15000 });

        await search.fill('zzz-no-match-zzz');
        await search.press('Enter');

        // URL should now carry q=…; router.replace is synchronous after input.
        await expect(page).toHaveURL(/[?&]q=zzz-no-match-zzz/, { timeout: 10000 });

        // Empty-state copy should surface under the no-match filter.
        await expect(
            page.locator('text=/no .+ match|no .+ found/i').first(),
        ).toBeVisible({ timeout: 10000 });
    });

    test('clearing the search returns to the unfiltered list', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/controls?q=zzz`);
        await page.waitForLoadState('networkidle');

        const search = page.locator('#control-search');
        await expect(search).toHaveValue('zzz');

        await search.fill('');
        await search.press('Enter');

        // q should drop out of the URL entirely.
        await expect(page).not.toHaveURL(/[?&]q=/);
    });

    test('FilterSelect trigger opens the command palette', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/controls`);
        await page.waitForLoadState('networkidle');

        // The shared FilterSelect renders a button labelled "Filter". Click the
        // first matching button to open the picker.
        const trigger = page.getByRole('button', { name: /filter/i }).first();
        await expect(trigger).toBeVisible({ timeout: 10000 });
        await trigger.click();

        // cmdk renders its list with role="listbox". The picker should now
        // present a list of top-level filter categories (Status, Applicability,
        // Owner, Category).
        await expect(page.getByRole('listbox').first()).toBeVisible({ timeout: 10000 });
    });

    test('picking a status filter pushes it into the URL', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/controls`);
        await page.waitForLoadState('networkidle');

        await page.getByRole('button', { name: /filter/i }).first().click();
        await expect(page.getByRole('listbox').first()).toBeVisible({ timeout: 10000 });

        // Drill into Status — scope to the cmdk listbox so the lookup
        // doesn't collide with the inline <select> status pills on
        // every control row (which expose `<option>Implemented</option>`
        // accessible names).
        const filterListbox = page.getByLabel('Suggestions');
        const statusRow = filterListbox.getByRole('option', { name: /^Status$/ });
        await statusRow.waitFor({ state: 'visible', timeout: 5000 });
        await statusRow.click();

        // Pick "Implemented"
        const implemented = filterListbox.getByRole('option', { name: /Implemented/ });
        await implemented.waitFor({ state: 'visible', timeout: 5000 });
        await implemented.click();

        // URL should now carry status=IMPLEMENTED.
        await expect(page).toHaveURL(/[?&]status=IMPLEMENTED/, { timeout: 10000 });
    });
});
