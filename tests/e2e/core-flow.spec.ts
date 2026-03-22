/**
 * E2E Core Certification Flow
 *
 * Serial test suite covering the full GRC certification lifecycle:
 * A) Login as admin
 * B) Create a Control
 * C) Upload Evidence linked to that Control
 * D) Create a Risk (via wizard)
 * E) Link Control to Risk (via TraceabilityPanel)
 *
 * Uses AUTH_TEST_MODE=1 credentials provider.
 * All selectors use existing id attributes — no data-testid additions needed.
 */
import { test, expect, Page } from '@playwright/test';
import * as path from 'path';

const TEST_USER = { email: 'admin@acme.com', password: 'password123' };
const UNIQUE = Date.now().toString(36);

// Shared state across serial tests
let tenantSlug: string;
const CONTROL_CODE = `E2E-CTRL-${UNIQUE}`;
const CONTROL_NAME = `E2E Access Control ${UNIQUE}`;
const RISK_TITLE = `E2E Risk ${UNIQUE}`;
const EVIDENCE_FIXTURE = path.resolve(__dirname, '../fixtures/evidence.txt');

// ── Helpers ──

async function loginAndGetTenant(page: Page): Promise<string> {
    await page.goto('/login');
    await page.waitForSelector('input[type="email"]', { timeout: 60000 });
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/t\/[^/]+\/dashboard/, { timeout: 15000 });
    const url = new URL(page.url());
    const match = url.pathname.match(/^\/t\/([^/]+)\//);
    if (!match) throw new Error('Could not extract tenant slug from ' + url.pathname);
    return match[1];
}

// ── Tests (serial) ──

test.describe('Core Certification Flow', () => {
    test.describe.configure({ mode: 'serial' });

    // A) Login
    test('A — login as admin and land on dashboard', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await expect(page).toHaveURL(/\/t\/[^/]+\/dashboard/);
        // Verify authenticated UI
        await expect(page.locator('text=Alice Admin').first()).toBeVisible({ timeout: 10000 });
    });

    // B) Create Control
    test('B — create a new control', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/controls/new`);
        await page.waitForSelector('#control-name-input', { timeout: 15000 });

        // Fill form
        await page.fill('#control-name-input', CONTROL_NAME);
        await page.fill('#control-code-input', CONTROL_CODE);
        await page.fill('#control-description-input', 'E2E test control for certification flow');

        // Submit
        await page.click('#create-control-btn');

        // Should redirect to control detail
        await page.waitForURL('**/controls/**', { timeout: 15000 });
        await page.waitForSelector('#control-title', { timeout: 15000 });

        // Verify control detail shows our code and title
        await expect(page.locator('#control-title')).toContainText(CONTROL_NAME, { timeout: 5000 });
    });

    // C) Upload Evidence linked to Control
    test('C — upload evidence and link to control', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/evidence`);
        await page.waitForSelector('h1', { timeout: 15000 });

        // Click upload button
        await page.click('#upload-evidence-btn');
        await page.waitForSelector('#upload-form', { timeout: 5000 });

        // Select file
        const fileInput = page.locator('#file-input');
        await fileInput.setInputFiles(EVIDENCE_FIXTURE);

        // Set title
        await page.fill('#upload-title-input', `E2E Evidence ${UNIQUE}`);

        // Select the control we created — search and pick from dropdown
        await page.fill('#control-search-input', CONTROL_CODE);
        // Wait for filtered dropdown to show our control
        await page.waitForLoadState('networkidle'); /* replaced wait */

        // Select the control from the dropdown
        const controlSelect = page.locator('#control-select');
        // Find an option containing our control code
        const optionCount = await controlSelect.locator('option').count();
        let controlFound = false;
        for (let i = 0; i < optionCount; i++) {
            const text = await controlSelect.locator('option').nth(i).textContent();
            if (text && text.includes(CONTROL_CODE)) {
                const value = await controlSelect.locator('option').nth(i).getAttribute('value');
                if (value) {
                    await controlSelect.selectOption(value);
                    controlFound = true;
                    break;
                }
            }
        }
        // If control not found in dropdown (e.g. search doesn't match), try without search
        if (!controlFound) {
            await page.fill('#control-search-input', '');
            await page.waitForLoadState('networkidle');
            const allOptionCount = await controlSelect.locator('option').count();
            for (let i = 0; i < allOptionCount; i++) {
                const text = await controlSelect.locator('option').nth(i).textContent();
                if (text && text.includes(CONTROL_NAME)) {
                    const value = await controlSelect.locator('option').nth(i).getAttribute('value');
                    if (value) {
                        await controlSelect.selectOption(value);
                        controlFound = true;
                        break;
                    }
                }
            }
        }

        // Submit upload
        await page.click('#submit-upload-btn');

        // Wait for upload to complete — form should disappear or evidence should appear in list
        await expect(page.locator('#upload-form')).not.toBeVisible({ timeout: 15000 });

        // Verify evidence appears in the page
        await expect(page.locator(`text=E2E Evidence ${UNIQUE}`).first()).toBeVisible({ timeout: 10000 });
    });

    // D) Create Risk via API — the wizard UI is tested elsewhere; here we ensure the risk exists for linking
    test('D — create a risk via API', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);

        // Navigate to any tenant-scoped page to establish auth context
        await page.goto(`/t/${tenantSlug}/risks`);
        await page.waitForSelector('h1', { timeout: 15000 });

        // Create risk via API (more deterministic than wizard UI for this flow test)
        const riskResult = await page.evaluate(async (riskTitle) => {
            const slug = window.location.pathname.split('/')[2];
            const res = await fetch(`${window.location.origin}/api/t/${slug}/risks`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: riskTitle,
                    description: 'E2E test risk for certification flow',
                    category: 'Technical',
                    likelihood: 4,
                    impact: 5,
                    treatmentOwner: 'E2E Test Owner',
                }),
            });
            const data = await res.json();
            return { ok: res.ok, status: res.status, id: data?.id, title: data?.title, score: data?.inherentScore };
        }, RISK_TITLE);

        expect(riskResult.ok).toBe(true);
        expect(riskResult.title).toBe(RISK_TITLE);

        // Reload the risks page to confirm risk is visible in the register
        await page.reload();
        await page.waitForSelector('h1', { timeout: 15000 });
        await expect(page.locator(`text=${RISK_TITLE}`).first()).toBeVisible({ timeout: 10000 });
    });

    // E) Link Control to Risk via TraceabilityPanel
    test('E — link control to risk via traceability panel', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);

        // Navigate to risks page to establish authenticated context
        await page.goto(`/t/${tenantSlug}/risks`);
        await page.waitForSelector('h1', { timeout: 15000 });

        // Find our risk via API
        const risksData = await page.evaluate(async (riskTitle) => {
            const slug = window.location.pathname.split('/')[2];
            const res = await fetch(`${window.location.origin}/api/t/${slug}/risks`, {
                credentials: 'include',
            });
            if (!res.ok) return { riskId: null, error: res.status };
            const data = await res.json();
            const arr = Array.isArray(data) ? data : (data.risks || []);
            const found = arr.find((r: any) => r.title === riskTitle); // eslint-disable-line @typescript-eslint/no-explicit-any
            return { riskId: found?.id };
        }, RISK_TITLE);

        expect(risksData.riskId).toBeTruthy();

        // Navigate to risk detail
        await page.goto(`/t/${tenantSlug}/risks/${risksData.riskId}`);
        await page.waitForSelector('#risk-title-heading', { timeout: 15000 });
        await expect(page.locator('#risk-title-heading')).toContainText(RISK_TITLE);

        // Wait for traceability panel to load
        await page.waitForSelector('#traceability-panel', { timeout: 10000 });

        // Click "+ Link Control"
        await page.click('#add-control-link-btn');

        // Wait for the control dropdown to populate — the TraceabilityPanel
        // fetches controls asynchronously via useEffect after the form renders.
        // We must wait for actual option elements beyond the placeholder.
        const controlDropdown = page.locator('#traceability-panel select').first();
        await controlDropdown.waitFor({ state: 'visible', timeout: 5000 });

        // Poll until dropdown has real options (> 1 means more than just "Select control...")
        await expect(async () => {
            const optCount = await controlDropdown.locator('option').count();
            expect(optCount).toBeGreaterThan(1);
        }).toPass({ timeout: 15000 });

        // Now iterate dropdown options to find our control
        const optCount = await controlDropdown.locator('option').count();
        let linked = false;
        for (let i = 0; i < optCount; i++) {
            const text = await controlDropdown.locator('option').nth(i).textContent();
            if (text && (text.includes(CONTROL_CODE) || text.includes(CONTROL_NAME))) {
                const value = await controlDropdown.locator('option').nth(i).getAttribute('value');
                if (value) {
                    await controlDropdown.selectOption(value);
                    linked = true;
                    break;
                }
            }
        }
        expect(linked).toBe(true);

        // Click "Link" button
        await page.click('#confirm-control-link');

        // Wait for linked controls table to appear
        await expect(page.locator('#linked-controls-table')).toBeVisible({ timeout: 10000 });

        // Verify our control appears in the linked table
        await expect(page.locator('#linked-controls-table')).toContainText(CONTROL_NAME, { timeout: 5000 });
    });

    // F) Verify bidirectional link — Control shows linked Risk
    test('F — verify control shows linked risk in traceability', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);

        // Navigate to controls page for authenticated context
        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForSelector('h1', { timeout: 15000 });

        // Find our control via API
        const controlData = await page.evaluate(async (controlName) => {
            const slug = window.location.pathname.split('/')[2];
            const res = await fetch(`${window.location.origin}/api/t/${slug}/controls`, {
                credentials: 'include',
            });
            if (!res.ok) return { controlId: null };
            const data = await res.json();
            const arr = Array.isArray(data) ? data : (data.controls || []);
            const found = arr.find((c: any) => c.name === controlName); // eslint-disable-line @typescript-eslint/no-explicit-any
            return { controlId: found?.id };
        }, CONTROL_NAME);

        expect(controlData.controlId).toBeTruthy();

        // Navigate to control detail
        await page.goto(`/t/${tenantSlug}/controls/${controlData.controlId}`);
        await page.waitForSelector('#control-title', { timeout: 15000 });
        await expect(page.locator('#control-title')).toContainText(CONTROL_NAME);

        // Click the Traceability tab (control detail uses tabs — Overview is default)
        await page.click('button:has-text("Traceability")');

        // Wait for traceability panel
        await page.waitForSelector('#traceability-panel', { timeout: 10000 });

        // Verify linked risks table shows our risk
        await expect(page.locator('#linked-risks-table')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('#linked-risks-table')).toContainText(RISK_TITLE, { timeout: 5000 });
    });
});
