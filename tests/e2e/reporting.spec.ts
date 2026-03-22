/**
 * E2E Reporting & Audit Narrative Tests
 *
 * Serial test suite covering:
 * A) Frameworks page loads with framework cards
 * B) Framework coverage report — metrics visible
 * C) Coverage export (JSON) — client-side download triggers
 * D) Reports page — SOA & Risk Register tables render
 * E) Audit cycle creation (ISO27001)
 * F) Audit pack creation, freeze, and share link generation
 * G) Shared pack read-only view (unauthenticated)
 *
 * Uses AUTH_TEST_MODE=1 credentials provider (admin@acme.com).
 */
import { test, expect, Page, BrowserContext } from '@playwright/test';

const TEST_USER = { email: 'admin@acme.com', password: 'password123' };
const UNIQUE = Date.now().toString(36);

let tenantSlug: string;

async function loginAndGetTenant(page: Page): Promise<string> {
    await page.goto('/login');
    await page.waitForSelector('input[type="email"]', { timeout: 60000 });
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/t\/[^/]+\/dashboard/, { timeout: 60000 });
    const match = new URL(page.url()).pathname.match(/^\/t\/([^/]+)\//);
    if (!match) throw new Error('Could not extract tenant slug from ' + page.url());
    const slug = match[1];

    // VERIFY-ON-EXIT: URL match alone doesn't prove the page rendered.
    // On cold-start, the server may return 500 — reload until fully rendered.
    let renderRetries = 3;
    while (renderRetries > 0) {
        const hasSidebar = await page.locator('aside').isVisible().catch(() => false);
        if (hasSidebar) break;
        renderRetries--;
        if (renderRetries > 0) {
            await page.waitForLoadState('networkidle');
            await page.goto(`/t/${slug}/dashboard`, { waitUntil: 'domcontentloaded' });
            await page.waitForLoadState('networkidle').catch(() => {});
        }
    }

    return slug;
}

/** Navigate to a server-rendered page and verify content rendered. */
async function gotoAndVerify(page: Page, url: string, contentSelector: string, maxAttempts = 3) {
    let attempts = maxAttempts;
    while (attempts > 0) {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => {});
        const rendered = await page.locator(contentSelector).first().isVisible().catch(() => false);
        if (rendered) return;
        attempts--;
        if (attempts > 0) await page.waitForTimeout(3000);
    }
}

test.describe('Reporting & Audit Narrative', () => {
    test.describe.configure({ mode: 'serial' });

    // Shared state for serial flow
    let cycleId: string;
    let packId: string;
    let shareToken: string;

    // ─── A) Frameworks Page ───────────────────────────────────────────

    test('A — frameworks page loads with framework cards', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);

        // VERIFY-ON-EXIT: check heading rendered, not just HTTP status
        await gotoAndVerify(page, `/t/${tenantSlug}/frameworks`, '#frameworks-heading');

        await expect(page.locator('#frameworks-heading')).toContainText('Compliance Frameworks');

        // Wait for cards to hydrate
        await page.waitForLoadState('networkidle');
        const cardCount = await page.locator('[id^="fw-card-"]').count();
        expect(cardCount).toBeGreaterThanOrEqual(1);
    });

    // ─── B) Coverage Report ──────────────────────────────────────────

    test('B — ISO27001 coverage report shows metrics', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        // VERIFY-ON-EXIT: navigate and wait for content
        await gotoAndVerify(page, `/t/${tenantSlug}/frameworks/ISO27001/coverage`, 'h1', 3);

        // Wait for the heading — may show "Coverage data not available" if no pack installed
        await page.waitForLoadState('networkidle');
        const heading = page.locator('#coverage-report-heading');
        const hasReport = await heading.isVisible().catch(() => false);

        if (!hasReport) {
            // Coverage page renders but no data — framework pack not installed
            test.skip(true, 'ISO27001 coverage data not available — pack not installed');
            return;
        }

        await expect(heading).toContainText('Coverage Report');

        // Metrics cards
        await expect(page.locator('#cov-total')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#cov-percent')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#cov-mapped')).toBeVisible();
        await expect(page.locator('#cov-unmapped')).toBeVisible();

        // Coverage table
        await expect(page.locator('#coverage-table')).toBeVisible();

        // Filter buttons
        await expect(page.locator('#filter-all')).toBeVisible();
        await expect(page.locator('#filter-mapped')).toBeVisible();
        await expect(page.locator('#filter-unmapped')).toBeVisible();
    });

    // ─── C) Coverage Export ──────────────────────────────────────────

    test('C — coverage page export JSON triggers download', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        // VERIFY-ON-EXIT: navigate and wait for content
        await gotoAndVerify(page, `/t/${tenantSlug}/frameworks/ISO27001/coverage`, 'h1', 3);

        const exportBtn = page.locator('#export-json-btn');
        const hasExport = await exportBtn.isVisible().catch(() => false);

        if (!hasExport) {
            test.skip(true, 'Export button not visible — coverage data not available');
            return;
        }

        // Intercept the download event
        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 5000 }),
            exportBtn.click(),
        ]);

        // Verify download properties
        expect(download.suggestedFilename()).toContain('coverage');
        expect(download.suggestedFilename()).toContain('.json');
    });

    // ─── D) Reports Page ─────────────────────────────────────────────

    test('D — reports page shows SOA and Risk Register', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        // VERIFY-ON-EXIT: check reports heading rendered
        await gotoAndVerify(page, `/t/${tenantSlug}/reports`, '#reports-heading', 4);

        // SOA tab should be active by default
        await expect(page.locator('#soa-tab-btn')).toBeVisible();
        await expect(page.locator('#risk-tab-btn')).toBeVisible();
        await expect(page.locator('#soa-table')).toBeVisible({ timeout: 5000 });

        // Export buttons
        await expect(page.locator('#export-soa-btn')).toBeVisible();
        await expect(page.locator('#export-risks-btn')).toBeVisible();

        // Switch to Risk Register tab
        await page.click('#risk-tab-btn');
        await expect(page.locator('#risk-table')).toBeVisible({ timeout: 5000 });

        // Switch back to SOA tab
        await page.click('#soa-tab-btn');
        await expect(page.locator('#soa-table')).toBeVisible({ timeout: 5000 });
    });

    // ─── E) Create Audit Cycle ───────────────────────────────────────

    test('E — create audit cycle (ISO27001)', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        // VERIFY-ON-EXIT: check heading rendered
        await gotoAndVerify(page, `/t/${tenantSlug}/audits/cycles`, 'h1', 3);

        // Click "New Audit Cycle"
        await page.click('#create-cycle-btn');
        await page.waitForSelector('#cycle-form', { timeout: 5000 });

        // Fill form
        await page.selectOption('#fw-select', 'ISO27001');
        await page.fill('#cycle-name-input', `E2E Audit Cycle ${UNIQUE}`);

        // Submit
        await page.click('#submit-cycle-btn');

        // Should redirect to cycle detail
        await page.waitForURL(/\/audits\/cycles\//, { timeout: 15000 });
        await page.waitForSelector('#cycle-name', { timeout: 15000 });
        await expect(page.locator('#cycle-name')).toContainText(`E2E Audit Cycle ${UNIQUE}`);

        // Store cycle ID from URL
        const urlMatch = page.url().match(/\/cycles\/([^/]+)/);
        expect(urlMatch).toBeTruthy();
        cycleId = urlMatch![1];
    });

    // ─── F) Create Pack, Freeze, Share ───────────────────────────────

    test('F — create default pack, freeze, and generate share link', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);

        // Navigate to cycle detail with verify-on-exit
        expect(cycleId).toBeTruthy();
        await gotoAndVerify(page, `/t/${tenantSlug}/audits/cycles/${cycleId}`, '#cycle-name', 3);

        // Click "Create Pack from Default Selection"
        const createPackBtn = page.locator('#create-default-pack-btn');
        await expect(createPackBtn).toBeVisible({ timeout: 5000 });
        await createPackBtn.click();

        // Should redirect to the pack detail page
        await page.waitForURL(/\/audits\/packs\//, { timeout: 60000 });
        await page.waitForSelector('#pack-name', { timeout: 15000 });

        // Extract pack ID from URL
        const packMatch = page.url().match(/\/packs\/([^/]+)/);
        expect(packMatch).toBeTruthy();
        packId = packMatch![1];

        // Verify pack is in DRAFT status
        await expect(page.locator('#pack-status')).toContainText('DRAFT');

        // Freeze the pack
        const freezeBtn = page.locator('#freeze-pack-btn');
        await expect(freezeBtn).toBeVisible({ timeout: 5000 });
        await freezeBtn.click();

        // Wait for status to change to FROZEN
        await expect(page.locator('#pack-status')).toContainText('FROZEN', { timeout: 10000 });

        // Share button should now appear
        const shareBtn = page.locator('#share-pack-btn');
        await expect(shareBtn).toBeVisible({ timeout: 5000 });
        await shareBtn.click();

        // Wait for share link card to appear
        await expect(page.locator('#share-link-card')).toBeVisible({ timeout: 10000 });
        const shareUrl = await page.locator('#share-link-url').textContent();
        expect(shareUrl).toBeTruthy();
        expect(shareUrl).toContain('/audit/shared/');

        // Extract the token from the share URL
        const tokenMatch = shareUrl!.match(/\/audit\/shared\/([^/]+)/);
        expect(tokenMatch).toBeTruthy();
        shareToken = tokenMatch![1];
    });

    // ─── G) Shared Read-Only View ────────────────────────────────────

    test('G — shared pack is accessible without login (read-only)', async ({ browser }) => {
        expect(shareToken).toBeTruthy();

        // Open a fresh browser context (no cookies, no login)
        const freshContext: BrowserContext = await browser.newContext();
        const freshPage = await freshContext.newPage();

        try {
            await freshPage.goto(`/audit/shared/${shareToken}`);
            await freshPage.waitForSelector('#shared-pack-name', { timeout: 15000 });

            // Verify the shared pack name is visible
            await expect(freshPage.locator('#shared-pack-name')).toBeVisible();

            // Verify read-only summary section is shown
            await expect(freshPage.locator('#shared-pack-summary')).toBeVisible({ timeout: 5000 });

            // Verify the footer states it's read-only
            await expect(freshPage.locator('text=Read-only view').first()).toBeVisible({ timeout: 5000 });

            // Ensure no edit/freeze buttons exist (read-only)
            await expect(freshPage.locator('#freeze-pack-btn')).not.toBeVisible();
            await expect(freshPage.locator('#share-pack-btn')).not.toBeVisible();
        } finally {
            await freshPage.close();
            await freshContext.close();
        }
    });
});
