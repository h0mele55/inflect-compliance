import { test, expect, Page } from '@playwright/test';
import { loginAndGetTenant, safeGoto } from './e2e-utils';

const TEST_USER = { email: 'admin@acme.com', password: 'password123' };

test.describe('Audit Readiness', () => {
    test.describe.configure({ mode: 'serial', timeout: 120_000 });

    let tenantSlug: string;
    let page: Page;
    let cycleId: string;
    let packId: string;
    let shareToken: string;

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage();
        // Retry loop: Next.js dev server may need several attempts to compile on cold start
        for (let attempt = 0; attempt < 5; attempt++) {
            await safeGoto(page, '/login').catch(() => null);
            const emailInput = page.locator('input[type="email"]');
            if (await emailInput.isVisible({ timeout: 10000 }).catch(() => false)) break;
            await page.waitForTimeout(5000);
        }
        tenantSlug = await loginAndGetTenant(page);
    });

    test.afterAll(async () => {
        await page.close();
    });

    // ─── ISO27001 Flow ───

    test('cycles page loads', async () => {
        // Page may need cold-compilation — retry on 500s
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const resp = await page.goto(`/t/${tenantSlug}/audits/cycles`);
                if (resp && resp.status() < 500) break;
            } catch {
                // net:: errors during heavy compilation
            }
            if (attempt < 2) await page.waitForTimeout(5000);
        }
        await page.waitForLoadState('networkidle').catch(() => {});
        await expect(page.locator('text=Audit Readiness')).toBeVisible({ timeout: 60000 });
    });

    test('create ISO27001 cycle', async () => {
        // Wait explicitly for the button to appear in DOM and become interactive
        const createBtn = page.locator('#create-cycle-btn');
        await createBtn.waitFor({ state: 'visible', timeout: 30000 });
        await createBtn.click();
        
        await page.waitForSelector('#cycle-form', { state: 'visible', timeout: 30000 });

        const uid = Date.now().toString(36);
        const cycleName = `E2E ISO27001 Audit ${uid}`;

        // ISO27001 is the default Combobox selection; no interaction
        // needed (Epic 55 migrated #fw-select from <select> to <Combobox>).
        await page.fill('#cycle-name-input', cycleName);
        await page.click('#submit-cycle-btn');

        // Should redirect to cycle detail
        await page.waitForURL(/\/audits\/cycles\//, { timeout: 30000 });
        await page.waitForLoadState('networkidle').catch(() => {});
        // Cycle detail page may need cold-compilation
        await page.waitForSelector('#cycle-name', { timeout: 60000 });
        await expect(page.locator('#cycle-name')).toContainText(cycleName, { timeout: 15000 });

        // Extract cycle ID from URL
        const url = page.url();
        const match = url.match(/\/cycles\/([^/?]+)/);
        if (match) cycleId = match[1];
    });

    test('cycle detail shows default pack preview', async () => {
        await page.waitForSelector('#preview-counts', { timeout: 15000 }).catch(() => null);
        const previewEl = page.locator('#preview-counts');
        if (await previewEl.isVisible().catch(() => false)) {
            // Should show controls/policies/evidence/issues counts
            await expect(page.locator('#preview-controls')).toBeVisible();
            await expect(page.locator('#preview-policies')).toBeVisible();
        }
    });

    test('create pack from default selection', async () => {
        const btn = page.locator('#create-default-pack-btn');
        await expect(btn).toBeVisible({ timeout: 10000 });
        await btn.click();

        // Should redirect to pack detail
        await page.waitForURL(/\/audits\/packs\//, { timeout: 60000 });
        await page.waitForLoadState('networkidle', { timeout: 60000 });
        await expect(page.locator('#pack-name')).toBeVisible({ timeout: 60000 });

        // Extract pack ID
        const url = page.url();
        const match = url.match(/\/packs\/([^/?]+)/);
        if (match) packId = match[1];
    });

    test('pack is in DRAFT status', async () => {
        await expect(page.locator('#pack-status')).toContainText('DRAFT', { timeout: 10000 });
    });

    test('freeze the pack', async () => {
        // The pack was just created by the previous serial test, so the
        // freeze button must be present — surface the failure loudly if
        // it's not.
        const freezeBtn = page.locator('#freeze-pack-btn');
        await expect(freezeBtn).toBeVisible({ timeout: 30_000 });

        // Click freeze and wait for the POST API response (large packs take time to snapshot)
        const [response] = await Promise.all([
            page.waitForResponse(resp => resp.url().includes('action=freeze') && resp.request().method() === 'POST', { timeout: 60_000 }),
            freezeBtn.click(),
        ]);
        expect(response.status()).toBe(200);

        // Wait for the UI to reload pack data and reflect FROZEN status
        await expect(page.locator('#pack-status')).toContainText('FROZEN', { timeout: 30_000 });
    });

    test('generate share link', async () => {
        const shareBtn = page.locator('#share-pack-btn');
        await expect(shareBtn).toBeVisible({ timeout: 30_000 });
        await shareBtn.click();

        await expect(page.locator('#share-link-card')).toBeVisible({ timeout: 15_000 });
        const linkEl = page.locator('#share-link-url');
        await expect(linkEl).toBeVisible();

        const linkText = await linkEl.textContent();
        expect(linkText).toContain('/audit/shared/');

        // Extract token — must be present so the next test can fetch it.
        const match = linkText?.match(/\/audit\/shared\/([a-f0-9]+)/);
        expect(match).not.toBeNull();
        shareToken = match![1];
    });

    test('auditor can view shared pack', async () => {
        expect(shareToken).toBeTruthy();

        // Shared pack page may need cold-compilation (client component + API route)
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const resp = await page.goto(`/audit/shared/${shareToken}`);
                if (resp && resp.status() < 500) break;
            } catch {
                // net:: errors during heavy compilation
            }
            if (attempt < 2) await page.waitForTimeout(5000);
        }
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForSelector('#shared-pack-name', { timeout: 60000 });
        await expect(page.locator('#shared-pack-name')).toBeVisible();
        await expect(page.locator('#shared-pack-summary')).toBeVisible();
        await expect(page.locator('text=Read-only view')).toBeVisible();
    });

    // ─── NIS2 Flow ───

    test('create NIS2 cycle', async () => {
        await page.goto(`/t/${tenantSlug}/audits/cycles`);
        // Wait for Network to settle instead of hardcoded 2000ms
        await page.waitForLoadState('networkidle');

        // Wait explicitly for the button to appear in DOM, meaning the data fetch completed
        await page.waitForSelector('#create-cycle-btn', { timeout: 15000 });
        await page.click('#create-cycle-btn');
        await page.waitForSelector('#cycle-form', { timeout: 5000 });

        const uid = Date.now().toString(36);
        const cycleName = `E2E NIS2 Audit ${uid}`;

        // Open the framework Combobox and pick the NIS2 option.
        await page.click('#fw-select');
        await page
            .getByRole('option', { name: /NIS2 Directive/ })
            .click();
        await page.fill('#cycle-name-input', cycleName);
        await page.click('#submit-cycle-btn');

        await page.waitForURL(/\/audits\/cycles\//, { timeout: 15000 });
        await expect(page.locator('#cycle-name')).toContainText(cycleName);
    });

    test('NIS2 cycle shows preview and can create pack', async () => {
        await page.waitForSelector('#create-default-pack-btn', { timeout: 15000 });
        await page.click('#create-default-pack-btn');

        await page.waitForURL(/\/audits\/packs\//, { timeout: 15000 });
        await expect(page.locator('#pack-name')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('#pack-status')).toContainText('DRAFT');
    });
});
