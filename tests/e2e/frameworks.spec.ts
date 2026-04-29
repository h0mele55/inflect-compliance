import { test, expect, Page } from '@playwright/test';
import { loginAndGetTenant } from './e2e-utils';

const TEST_USER = { email: 'admin@acme.com', password: 'password123' };

// GAP-23 carve-out: this spec depends on the seeded acme-corp tenant
// having ISO27001 / SOC2 / NIS2 / ISO9001 / ISO28000 / ISO39001
// frameworks installed. createIsolatedTenant produces an empty
// tenant with no installed frameworks. Migrating this spec is gated
// on the factory gaining a `installFrameworks: ['ISO27001', …]`
// option (or a sibling helper that calls the framework-install
// usecase for a freshly-created tenant).

test.describe('Framework Coverage UI', () => {
    test.describe.configure({ mode: 'serial' });

    let tenantSlug: string;
    let page: Page;

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage();
        // Warmup: visit root page to ensure server compiles
        await page.goto('/login', { timeout: 60000 }).catch(() => null);
        await page.waitForTimeout(2000);
        tenantSlug = await loginAndGetTenant(page);
    });

    test.afterAll(async () => {
        await page.close();
    });

    test('frameworks page loads', async () => {
        await page.goto(`/t/${tenantSlug}/frameworks`);
        await page.waitForLoadState('networkidle');
        await page.waitForSelector('#frameworks-heading', { timeout: 60000 });
        await expect(page.locator('#frameworks-heading')).toContainText('Compliance Frameworks');
    });

    test('framework cards are visible', async () => {
        // Seed guarantees at least ISO27001 + SOC2 + NIS2 + ISO9001 + ISO28000 + ISO39001.
        const cards = page.locator('[id^="fw-card-"]');
        await expect(cards.first()).toBeVisible({ timeout: 30_000 });
        expect(await cards.count()).toBeGreaterThanOrEqual(1);
    });

    test('can navigate to framework detail', async () => {
        const viewBtn = page.locator('[id^="view-framework-"]').first();
        await expect(viewBtn).toBeVisible({ timeout: 30_000 });
        await viewBtn.click();
        // Framework detail is a client page that fetches 4 API endpoints.
        // On first access, Next.js JIT-compiles the page + all API routes,
        // which can take 30-60s in cold environments.
        await page.waitForLoadState('networkidle').catch(() => {});
        await expect(page.locator('#framework-detail-heading')).toBeVisible({ timeout: 60_000 });
    });

    test('detail page shows tabs', async () => {
        // The previous test may have navigated away; re-establish the
        // framework detail view deterministically via the URL.
        await page.goto(`/t/${tenantSlug}/frameworks/ISO27001`);
        await expect(page.locator('#framework-detail-heading')).toBeVisible({ timeout: 60_000 });
        await expect(page.locator('#tab-requirements')).toBeVisible();
        await expect(page.locator('#tab-packs')).toBeVisible();
        await expect(page.locator('#tab-coverage')).toBeVisible();
    });

    test('requirements tab works', async () => {
        await expect(page.locator('#tab-requirements')).toBeVisible({ timeout: 30_000 });
        await page.locator('#tab-requirements').click();
        await expect(page.locator('#requirements-panel')).toBeVisible({ timeout: 30_000 });
        await expect(page.locator('#requirements-search')).toBeVisible();
    });

    test('packs tab works', async () => {
        await expect(page.locator('#tab-packs')).toBeVisible({ timeout: 30_000 });
        await page.locator('#tab-packs').click();
        await expect(page.locator('#packs-panel')).toBeVisible({ timeout: 30_000 });
    });

    test('coverage tab works', async () => {
        await expect(page.locator('#tab-coverage')).toBeVisible({ timeout: 30_000 });
        await page.locator('#tab-coverage').click();
        await expect(page.locator('#coverage-panel')).toBeVisible({ timeout: 30_000 });
    });

    test('install wizard loads', async () => {
        await page.goto(`/t/${tenantSlug}/frameworks/ISO27001/install`);
        await page.waitForLoadState('networkidle');
        await expect(page.locator('#install-wizard-heading')).toContainText('Install', { timeout: 30_000 });
    });

    test('install wizard shows preview', async () => {
        // The wizard auto-selects the first pack and renders the preview
        // counter; its value depends on seed state but must be numeric.
        await expect(page.locator('#install-wizard-heading')).toBeVisible({ timeout: 30_000 });
        await expect(page.locator('#preview-new-controls')).toBeVisible({ timeout: 30_000 });
        const text = await page.locator('#preview-new-controls').textContent();
        expect(parseInt(text || 'NaN')).toBeGreaterThanOrEqual(0);
    });

    test('can install pack', async () => {
        const installBtn = page.locator('#confirm-install-btn');
        await expect(installBtn).toBeVisible({ timeout: 30_000 });
        const btnText = (await installBtn.textContent()) || '';
        if (btnText.includes('already installed')) {
            // Idempotent path: seed already installed the pack links, so
            // the button reflects the "already installed" end state.
            expect(btnText).toContain('already installed');
            return;
        }
        await installBtn.click();
        await expect(page.locator('#install-result')).toContainText('Successfully', { timeout: 60_000 });
    });

    // Coverage data is exposed via the in-page Coverage tab on the
    // framework detail page (see "coverage tab works" above). There is
    // no separate `/frameworks/[key]/coverage` route in the product
    // surface — the standalone-route smoke tests previously here were
    // always skipped and have been removed in the Epic 55/56 cleanup
    // pass.
});
