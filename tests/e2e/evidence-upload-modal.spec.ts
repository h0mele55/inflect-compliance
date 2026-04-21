import { test, expect } from '@playwright/test';
import { loginAndGetTenant, safeGoto } from './e2e-utils';

/**
 * Epic 54 — Evidence upload + create-text modals.
 *
 * Verifies the modal-first evidence flow that replaces the old inline
 * `glass-card` forms on the Evidence list page. Business behaviour is
 * unchanged: the Upload modal still POSTs FormData to
 * `/evidence/uploads`, the Text modal still POSTs JSON to `/evidence`
 * with `type=TEXT`, and both invalidate the React-Query cache so the
 * list repopulates on success.
 *
 *   - Clicking `#upload-evidence-btn` from the list opens the modal
 *     (no navigation, list context preserved).
 *   - Submit is disabled until a file is selected.
 *   - Attaching a file via the `#file-input` (kept visually-hidden by
 *     the shared <FileUpload>) enables submit; POST to
 *     `/evidence/uploads` succeeds; the list refreshes.
 *   - Cancel closes the modal and the list stays on-screen.
 *   - Clicking `#add-text-evidence-btn` opens the text-evidence modal;
 *     title gating + successful create/list-refresh behave the same.
 */

test.describe('Epic 54 — Evidence upload modal', () => {
    // Each modal test gets its own fresh browser context. Serial mode
    // shares context across tests, and Radix Dialog leaves residual
    // portal/focus-trap state that blocks the second open() in
    // `next dev`.

    let tenantSlug: string;

    test('clicking Upload File opens the modal without navigating away', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/evidence`);
        await page.waitForSelector('#upload-evidence-btn', { timeout: 15000 });
        // Wait for React hydration so the onClick handler is actually
        // attached before we click — long-running full-suite runs can
        // put the dev server into a JIT-recompile state that delays
        // hydration past the default click debounce.
        await page.waitForLoadState('networkidle').catch(() => {});
        const listUrl = page.url();

        await page.click('#upload-evidence-btn');

        await expect(page.locator('#upload-form')).toBeVisible({ timeout: 10000 });
        expect(page.url()).toBe(listUrl);

        // Close the modal so it doesn't leak into downstream serial-mode
        // tests (the shared browser context retains Vaul/Radix global
        // focus-trap + overlay state otherwise).
        await page.click('#upload-evidence-cancel-btn');
        await expect(page.locator('#upload-form')).toBeHidden({ timeout: 5000 });
    });

    test('submit is disabled until a file is attached', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/evidence`);
        // Reload to reset any Radix focus-trap state from the prior
        // serial-mode test before clicking the open-modal button.
        await page.reload({ waitUntil: 'domcontentloaded' });
        const openBtn = page.locator('#upload-evidence-btn');
        await openBtn.waitFor({ state: 'visible', timeout: 15_000 });
        await page.waitForLoadState('networkidle').catch(() => {});
        await openBtn.click();
        await expect(page.locator('#upload-form')).toBeVisible({ timeout: 60_000 });

        await expect(page.locator('#submit-upload-btn')).toBeDisabled();

        // Close so the next serial test starts clean.
        await page.click('#upload-evidence-cancel-btn');
        await expect(page.locator('#upload-form')).toBeHidden({ timeout: 5000 });
    });

    test('attaching a file and submitting POSTs to /evidence/uploads', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/evidence`);
        await page.reload({ waitUntil: 'domcontentloaded' });
        const openBtn2 = page.locator('#upload-evidence-btn');
        await openBtn2.waitFor({ state: 'visible', timeout: 15_000 });
        await page.waitForLoadState('networkidle').catch(() => {});
        await openBtn2.click();
        await expect(page.locator('#upload-form')).toBeVisible({ timeout: 60_000 });

        const uid = Date.now().toString(36);
        const filename = `modal-evidence-${uid}.txt`;
        const payload = Buffer.from(`Epic 54 evidence upload ${uid}\n`);

        // setInputFiles works against the visually-hidden FileUpload input.
        await page.setInputFiles('#file-input', {
            name: filename,
            mimeType: 'text/plain',
            buffer: payload,
        });
        await page.fill('#upload-title-input', `Modal Evidence ${uid}`);

        await expect(page.locator('#submit-upload-btn')).toBeEnabled();

        const [response] = await Promise.all([
            page.waitForResponse(
                (r) =>
                    r.url().includes('/api/t/') &&
                    r.url().includes('/evidence/uploads') &&
                    r.request().method() === 'POST',
            ),
            page.click('#submit-upload-btn'),
        ]);
        expect(response.status(), 'POST /evidence/uploads succeeded').toBeLessThan(400);

        // Modal closes on success.
        await expect(page.locator('#upload-form')).toBeHidden({ timeout: 10000 });
        // List refreshes — new row is present.
        await expect(page.locator('#evidence-table')).toContainText(
            `Modal Evidence ${uid}`,
            { timeout: 15000 },
        );
    });

    test('Cancel closes the modal and leaves the list untouched', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/evidence`);
        await page.reload({ waitUntil: 'domcontentloaded' });
        const openBtn3 = page.locator('#upload-evidence-btn');
        await openBtn3.waitFor({ state: 'visible', timeout: 15_000 });
        await page.waitForLoadState('networkidle').catch(() => {});
        await openBtn3.click();
        await expect(page.locator('#upload-form')).toBeVisible({ timeout: 60_000 });

        await page.click('#upload-evidence-cancel-btn');

        await expect(page.locator('#upload-form')).toBeHidden({ timeout: 5000 });
        await expect(page.locator('#evidence-table')).toBeVisible();
    });
});

test.describe('Epic 54 — Add text evidence modal', () => {
    // Each modal test gets its own fresh browser context — see the
    // comment on the upload-modal describe block above.

    let tenantSlug: string;

    test('clicking Add Evidence opens the text-evidence modal', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/evidence`);
        await page.waitForSelector('#add-text-evidence-btn', { timeout: 15000 });

        await page.click('#add-text-evidence-btn');

        await expect(page.locator('#text-evidence-form')).toBeVisible({ timeout: 30_000 });
        await expect(page.locator('#text-evidence-title-input')).toBeFocused({ timeout: 3000 });

        // Close so the open modal doesn't leak into the next serial test.
        await page.click('#text-evidence-cancel-btn');
        await expect(page.locator('#text-evidence-form')).toBeHidden({ timeout: 5000 });
    });

    test('create button is disabled until title is filled', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/evidence`);
        await page.reload({ waitUntil: 'domcontentloaded' });
        const textBtn = page.locator('#add-text-evidence-btn');
        await textBtn.waitFor({ state: 'visible', timeout: 15_000 });
        await page.waitForLoadState('networkidle').catch(() => {});
        await textBtn.click();
        await expect(page.locator('#text-evidence-form')).toBeVisible({ timeout: 60_000 });

        await expect(page.locator('#create-text-evidence-btn')).toBeDisabled();
        await page.fill('#text-evidence-title-input', 'T');
        await expect(page.locator('#create-text-evidence-btn')).toBeEnabled();
        await page.fill('#text-evidence-title-input', '');
        await expect(page.locator('#create-text-evidence-btn')).toBeDisabled();

        // Close so the next serial test starts clean.
        await page.click('#text-evidence-cancel-btn');
        await expect(page.locator('#text-evidence-form')).toBeHidden({ timeout: 5000 });
    });

    test('submitting creates evidence and refreshes the list', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/evidence`);
        await page.reload({ waitUntil: 'domcontentloaded' });
        const textBtn2 = page.locator('#add-text-evidence-btn');
        await textBtn2.waitFor({ state: 'visible', timeout: 15_000 });
        await page.waitForLoadState('networkidle').catch(() => {});
        await textBtn2.click();
        await expect(page.locator('#text-evidence-form')).toBeVisible({ timeout: 60_000 });

        const uid = Date.now().toString(36);
        const title = `Modal Text Evidence ${uid}`;
        await page.fill('#text-evidence-title-input', title);
        await page.fill('#text-evidence-content-input', 'Narrative captured via modal.');

        const [response] = await Promise.all([
            page.waitForResponse(
                (r) =>
                    r.url().includes('/api/t/') &&
                    r.url().endsWith('/evidence') &&
                    r.request().method() === 'POST',
            ),
            page.click('#create-text-evidence-btn'),
        ]);
        expect(response.status(), 'POST /evidence succeeded').toBeLessThan(400);

        await expect(page.locator('#text-evidence-form')).toBeHidden({ timeout: 10000 });
        await expect(page.locator('#evidence-table')).toContainText(title, {
            timeout: 15000,
        });
    });
});
