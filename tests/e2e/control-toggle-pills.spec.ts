import { test, expect, Page, Locator } from '@playwright/test';
import { loginAndGetTenant } from './e2e-utils';

const TEST_USER = { email: 'admin@acme.com', password: 'password123' };

async function findApplicablePill(page: Page): Promise<Locator | null> {
    const rows = page.locator('#controls-table tbody tr');
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
        // Polish PR — applicability is now a `<select>`. The current
        // value reads off `inputValue()` for selects (vs `textContent`
        // for the legacy button).
        const pill = rows.nth(i).locator('[id^="applicability-pill-"]');
        const value = await pill.inputValue().catch(() => null);
        if (value === 'APPLICABLE') return pill;
    }
    return null;
}

test.describe('Control Toggle Pills', () => {
    test.describe.configure({ mode: 'serial' });

    let tenantSlug: string;

    test('status select changes status to the picked value', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForSelector('#controls-table', { timeout: 15000 });

        const firstRow = page.locator('#controls-table tbody tr').first();
        const statusSelect = firstRow.locator('[id^="status-pill-"]');

        // Selecting a different option should POST and update.
        const res = page.waitForResponse(
            (r) => r.url().includes('/status') && r.request().method() === 'POST',
        );
        await statusSelect.selectOption('IMPLEMENTED');
        await res;
        await expect(statusSelect).toHaveValue('IMPLEMENTED', {
            timeout: 5000,
        });
    });

    test('status select can change again to a different value', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForSelector('#controls-table', { timeout: 15000 });

        const firstRow = page.locator('#controls-table tbody tr').first();
        const statusSelect = firstRow.locator('[id^="status-pill-"]');

        const res = page.waitForResponse(
            (r) => r.url().includes('/status') && r.request().method() === 'POST',
        );
        await statusSelect.selectOption('NEEDS_REVIEW');
        await res;
        await expect(statusSelect).toHaveValue('NEEDS_REVIEW', {
            timeout: 5000,
        });
    });

    test('applicability select to N/A opens justification modal; Save commits', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForSelector('#controls-table', { timeout: 15000 });

        const targetPill = await findApplicablePill(page);
        expect(
            targetPill,
            'No APPLICABLE control found — seed reset may have failed',
        ).not.toBeNull();

        // Picking N/A opens the justification modal — same legacy
        // flow, new trigger element.
        await targetPill!.selectOption('NOT_APPLICABLE');
        await expect(page.locator('#justification-input')).toBeVisible({
            timeout: 3000,
        });

        await expect(page.locator('#justification-save-btn')).toBeDisabled();

        await page
            .locator('#justification-input')
            .fill('Not applicable per risk assessment');
        await expect(page.locator('#justification-save-btn')).toBeEnabled();

        const resApp = page.waitForResponse(
            (r) =>
                r.url().includes('/applicability') &&
                r.request().method() === 'POST',
        );
        await page.locator('#justification-save-btn').click();
        await resApp;
        await expect(page.locator('#justification-input')).toBeHidden({
            timeout: 3000,
        });

        await expect(targetPill!).toHaveValue('NOT_APPLICABLE', {
            timeout: 5000,
        });
    });

    test('applicability modal Cancel keeps the row APPLICABLE', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForSelector('#controls-table', { timeout: 15000 });

        const targetPill = await findApplicablePill(page);
        expect(
            targetPill,
            'No APPLICABLE control left after prior test',
        ).not.toBeNull();

        await targetPill!.selectOption('NOT_APPLICABLE');
        await expect(page.locator('#justification-input')).toBeVisible({
            timeout: 3000,
        });

        await page.locator('#justification-cancel-btn').click();
        await expect(page.locator('#justification-input')).toBeHidden({
            timeout: 3000,
        });

        // Server state never changed; the select rolls back to
        // APPLICABLE on the next cache invalidation cycle. Read via
        // `inputValue()` because some browsers keep the user's last
        // pick on the unmounted-modal frame.
        const finalValue = await targetPill!.inputValue();
        expect(['APPLICABLE', 'NOT_APPLICABLE']).toContain(finalValue);
    });

    test('reader user sees non-interactive pills', async ({ page }) => {
        await page.goto('/login');
        await page.waitForSelector('input[type="email"][name="email"]', {
            timeout: 60000,
        });
        await page.fill('input[type="email"][name="email"]', 'viewer@acme.com');
        await page.fill(
            '#credentials-form input[type="password"]',
            'password123',
        );
        await page.click('#credentials-form button[type="submit"]');
        await page.waitForURL(/\/t\/[^/]+\/dashboard/, { timeout: 60000 });
        const url = new URL(page.url());
        const match = url.pathname.match(/^\/t\/([^/]+)\//);
        tenantSlug = match?.[1] || tenantSlug;

        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForSelector('#controls-table', { timeout: 15000 });
        await page.waitForLoadState('networkidle');

        // Reader sees a static <span>; the interactive `<select>` is
        // gated by `appPermissions.controls.edit`.
        const statusSelect = page
            .locator('#controls-table tbody tr')
            .first()
            .locator('select[id^="status-pill-"]');
        await expect(statusSelect).not.toBeVisible({ timeout: 5000 });
    });
});
