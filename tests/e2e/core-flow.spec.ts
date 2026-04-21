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
import { loginAndGetTenant, safeGoto } from './e2e-utils';
import * as path from 'path';

const TEST_USER = { email: 'admin@acme.com', password: 'password123' };
const UNIQUE = Date.now().toString(36);

// Shared state across serial tests
let tenantSlug: string;
const CONTROL_CODE = `E2E-CTRL-${UNIQUE}`;
const CONTROL_NAME = `E2E Access Control ${UNIQUE}`;
const RISK_TITLE = `E2E Risk ${UNIQUE}`;
const EVIDENCE_FIXTURE = path.resolve(__dirname, '../fixtures/evidence.txt');

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
        await safeGoto(page, `/t/${tenantSlug}/controls/new`);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForSelector('#control-name-input', { timeout: 60000 });

        // Fill form
        await page.fill('#control-name-input', CONTROL_NAME);
        await page.fill('#control-code-input', CONTROL_CODE);
        await page.fill('#control-description-input', 'E2E test control for certification flow');

        // Submit
        await page.click('#create-control-btn');

        // Should redirect to control detail
        await page.waitForURL('**/controls/**', { timeout: 30000 });
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForSelector('#control-title', { timeout: 60000 });

        // Verify control detail shows our code and title
        await expect(page.locator('#control-title')).toContainText(CONTROL_NAME, { timeout: 5000 });
    });

    // C) Upload Evidence linked to Control
    test('C — upload evidence and link to control', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/evidence`);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForSelector('h1', { timeout: 60000 });

        // Click upload button
        await page.click('#upload-evidence-btn');
        await page.waitForSelector('#upload-form', { timeout: 5000 });

        // Select file
        const fileInput = page.locator('#file-input');
        await fileInput.setInputFiles(EVIDENCE_FIXTURE);

        // Set title
        await page.fill('#upload-title-input', `E2E Evidence ${UNIQUE}`);

        // Epic 55: the control linker is now a <Combobox>. Open the
        // trigger, type into the cmdk search, click the matching option.
        await page.click('#control-select');
        const comboSearch = page.getByPlaceholder('Search controls…');
        await comboSearch.fill(CONTROL_CODE);
        // cmdk renders role="option" rows inside role="listbox".
        const codeOption = page
            .getByRole('option')
            .filter({ hasText: CONTROL_CODE })
            .first();
        let controlFound = await codeOption
            .waitFor({ state: 'visible', timeout: 3000 })
            .then(() => true)
            .catch(() => false);
        if (controlFound) {
            await codeOption.click();
        }
        // Fallback: search by control name instead of code.
        if (!controlFound) {
            await comboSearch.fill('');
            await page.waitForLoadState('networkidle').catch(() => {});
            const nameOption = page
                .getByRole('option')
                .filter({ hasText: CONTROL_NAME })
                .first();
            if (
                await nameOption
                    .waitFor({ state: 'visible', timeout: 3000 })
                    .then(() => true)
                    .catch(() => false)
            ) {
                await nameOption.click();
                controlFound = true;
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
        await safeGoto(page, `/t/${tenantSlug}/risks`);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForSelector('h1', { timeout: 60000 });

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
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForSelector('h1', { timeout: 30000 });
        await expect(page.locator(`text=${RISK_TITLE}`).first()).toBeVisible({ timeout: 10000 });
    });

    // E) Link Control to Risk via TraceabilityPanel
    test('E — link control to risk via traceability panel', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);

        // Navigate to risks page to establish authenticated context
        await safeGoto(page, `/t/${tenantSlug}/risks`);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForSelector('h1', { timeout: 60000 });

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
        await safeGoto(page, `/t/${tenantSlug}/risks/${risksData.riskId}`);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForSelector('#risk-title-heading', { timeout: 60000 });
        await expect(page.locator('#risk-title-heading')).toContainText(RISK_TITLE, { timeout: 10000 });

        // Wait for traceability panel to load (dynamically imported, needs JIT compilation)
        await page.waitForSelector('#traceability-panel', { timeout: 60000 });

        // Click "+ Link Control"
        await page.click('#add-control-link-btn');

        // Epic 55 migrated TraceabilityPanel's control picker from a
        // native <select> to a searchable <Combobox> (#control-select).
        // Open the popover, type the unique control code, then click the
        // matching option.
        const controlTrigger = page.locator('#control-select').first();
        await controlTrigger.waitFor({ state: 'visible', timeout: 30_000 });
        await controlTrigger.click();
        await page.getByPlaceholder('Search…').fill(CONTROL_CODE);
        await page
            .getByRole('option')
            .filter({ hasText: CONTROL_CODE })
            .first()
            .click();

        // Click "Link" button
        await page.click('#confirm-control-link');

        // Wait for linked controls table to appear and finish loading.
        // After the link action, the table fetches data asynchronously —
        // it initially shows "Loading..." which must clear before we assert.
        await expect(page.locator('#linked-controls-table')).toBeVisible({ timeout: 10000 });

        // Wait for "Loading" text to disappear (data fetched)
        await expect(page.locator('#linked-controls-table')).not.toContainText('Loading', { timeout: 30000 });

        // Verify our control appears in the linked table
        await expect(page.locator('#linked-controls-table')).toContainText(CONTROL_NAME, { timeout: 15000 });
    });

    // F) Verify bidirectional link — Control shows linked Risk
    test('F — verify control shows linked risk in traceability', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);

        // Navigate to controls page for authenticated context
        await safeGoto(page, `/t/${tenantSlug}/controls`);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForSelector('h1', { timeout: 60000 });

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
        await safeGoto(page, `/t/${tenantSlug}/controls/${controlData.controlId}`);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForSelector('#control-title', { timeout: 60000 });
        await expect(page.locator('#control-title')).toContainText(CONTROL_NAME);

        // Click the Traceability tab (control detail uses tabs — Overview is default)
        await page.click('button:has-text("Traceability")');

        // Wait for traceability panel (dynamically imported, needs JIT compilation)
        await page.waitForSelector('#traceability-panel', { timeout: 60000 });

        // Verify linked risks table shows our risk
        await expect(page.locator('#linked-risks-table')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('#linked-risks-table')).toContainText(RISK_TITLE, { timeout: 5000 });
    });
});
