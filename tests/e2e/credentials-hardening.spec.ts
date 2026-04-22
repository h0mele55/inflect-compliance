/**
 * E2E coverage for the credentials-path UX surface added by the auth
 * hardening pass — the verifyStatus banners and the resend-verification
 * form on the login page.
 *
 * The chokepoint-side behaviour (rate limit, audit, email verification)
 * is covered by the real-DB integration test at
 * `tests/integration/credentials-end-to-end.test.ts`. Playwright runs
 * with AUTH_TEST_MODE=1 which deliberately bypasses rate-limit and the
 * email-verification gate, so we don't re-test those here — we just
 * prove the UI renders the right state for each `?verifyStatus=` value
 * and that the resend form posts without the success message leaking
 * account state.
 */
import { test, expect } from '@playwright/test';
import { safeGoto } from './e2e-utils';

test.describe('Credentials hardening — login UI', () => {
    test('renders the success banner when ?verifyStatus=verified', async ({ page }) => {
        await safeGoto(page, '/login?verifyStatus=verified');
        await expect(
            page.getByText('Email verified — you can sign in now.'),
        ).toBeVisible({ timeout: 30_000 });
    });

    test('renders the expired banner when ?verifyStatus=expired', async ({ page }) => {
        await safeGoto(page, '/login?verifyStatus=expired');
        await expect(
            page.getByText('That verification link has expired. Request a new one below.'),
        ).toBeVisible({ timeout: 30_000 });
    });

    test('renders the invalid banner when ?verifyStatus=invalid', async ({ page }) => {
        await safeGoto(page, '/login?verifyStatus=invalid');
        await expect(
            page.getByText('That verification link is not valid. Request a new one below.'),
        ).toBeVisible({ timeout: 30_000 });
    });

    test('shows the resend-verification form with uniform response on submit', async ({ page }) => {
        await safeGoto(page, '/login');
        // Wait for hydration before interacting — the resend form lives
        // inside the credentials-enabled branch, which only renders once
        // getProviders() resolves client-side.
        const resendInput = page.locator('input[name="resendEmail"]');
        await expect(resendInput).toBeVisible({ timeout: 30_000 });

        await resendInput.fill('anyone@example.com');
        await page.getByRole('button', { name: 'Resend' }).click();

        // Uniform response copy — same whether or not the email is
        // actually registered. Matches src/app/api/auth/verify-email/resend/route.ts
        await expect(
            page.getByText(
                'If that email is registered and not yet verified, a new link is on its way.',
            ),
        ).toBeVisible({ timeout: 30_000 });
    });
});
