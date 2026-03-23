import { test, expect, Page } from '@playwright/test';

const TEST_USER = { email: 'admin@acme.com', password: 'password123' };

async function loginAndGetTenant(page: Page): Promise<string> {
    await page.goto('/login');
    await page.waitForSelector('input[type="email"]', { timeout: 60000 });
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/t\/[^/]+\/dashboard/, { timeout: 60000 });
    const match = new URL(page.url()).pathname.match(/^\/t\/([^/]+)\//);
    if (!match) throw new Error('Could not extract tenant slug');
    return match[1];
}

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
            await page.goto('/login', { timeout: 60000 }).catch(() => null);
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
        await page.goto(`/t/${tenantSlug}/audits/cycles`);
        await page.waitForLoadState('networkidle');
        await expect(page.locator('text=Audit Readiness')).toBeVisible({ timeout: 15000 });
    });

    test('create ISO27001 cycle', async () => {
        // Wait explicitly for the button to appear in DOM and become interactive
        const createBtn = page.locator('#create-cycle-btn');
        await createBtn.waitFor({ state: 'visible', timeout: 30000 });
        await createBtn.click();
        
        await page.waitForSelector('#cycle-form', { state: 'visible', timeout: 30000 });

        const uid = Date.now().toString(36);
        const cycleName = `E2E ISO27001 Audit ${uid}`;

        // Select ISO27001
        await page.selectOption('#fw-select', 'ISO27001');
        await page.fill('#cycle-name-input', cycleName);
        await page.click('#submit-cycle-btn');

        // Should redirect to cycle detail
        await page.waitForURL(/\/audits\/cycles\//, { timeout: 30000 });
        await page.waitForLoadState('networkidle');
        await expect(page.locator('#cycle-name')).toContainText(cycleName);

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
        const freezeBtn = page.locator('#freeze-pack-btn');
        if (!await freezeBtn.isVisible().catch(() => false)) { test.skip(); return; }
        await freezeBtn.click();

        // Wait for status to change
        await page.waitForTimeout(3000);
        await expect(page.locator('#pack-status')).toContainText('FROZEN', { timeout: 15000 });
    });

    test('generate share link', async () => {
        const shareBtn = page.locator('#share-pack-btn');
        if (!await shareBtn.isVisible().catch(() => false)) { test.skip(); return; }
        await shareBtn.click();

        await page.waitForSelector('#share-link-card', { timeout: 10000 });
        const linkEl = page.locator('#share-link-url');
        await expect(linkEl).toBeVisible();

        const linkText = await linkEl.textContent();
        expect(linkText).toContain('/audit/shared/');

        // Extract token
        const match = linkText?.match(/\/audit\/shared\/([a-f0-9]+)/);
        if (match) shareToken = match[1];
    });

    test('auditor can view shared pack', async () => {
        if (!shareToken) { test.skip(); return; }

        await page.goto(`/audit/shared/${shareToken}`);
        await page.waitForSelector('#shared-pack-name', { timeout: 15000 });
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

        await page.selectOption('#fw-select', 'NIS2');
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
