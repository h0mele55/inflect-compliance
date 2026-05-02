import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
// Always use a dedicated port for E2E tests to avoid conflicts with `npm run dev` on 3000.
// This ensures E2E tests always start their own server with AUTH_TEST_MODE=1.
const port = 3006;

export default defineConfig({
    testDir: './tests/e2e',
    globalSetup: './tests/e2e/global-setup.ts',
    // GAP-23: hard-deletes any tenants the suite created via
    // `createIsolatedTenant` (tracked in
    // `tests/e2e/.tenant-tracker.jsonl`). Idempotent — does
    // nothing when the file is absent. Failures don't abort the
    // run; the tracker file is preserved so the next run retries.
    globalTeardown: './tests/e2e/global-teardown.ts',
    timeout: 180_000,
    fullyParallel: false,
    forbidOnly: isCI,
    // BOTH CI and local runs use `next start` (production mode) — a
    // pre-compiled server that handles the full serial suite cleanly.
    // We previously used `next dev` locally, which JIT-compiles routes
    // and leaks memory over long sessions. The 30-ish spec serial suite
    // ran ~38 min and the dev server consistently degraded near the
    // end (ECONNREFUSED, 30-60s selector timeouts on pages that render
    // fine in isolation), producing 2-3 spurious failures per run that
    // 1 retry couldn't recover from because the server stayed slow.
    //
    // `scripts/e2e-local.mjs` already runs `next build` before kicking
    // off Playwright, so the build artifact is always fresh. Direct
    // `npx playwright test` invocations need a prior `npx next build`
    // (without it, `next start` errors out with a clear message).
    //
    // 2 retries on both — local can still hit transient localhost
    // races, but production-mode server eliminates the systematic
    // degradation flakes that were the dominant failure mode.
    retries: 2,
    workers: 1,
    reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: process.env.URL || 'http://localhost:3006',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'on',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        // AUTH_URL / NEXTAUTH_URL must match the actual test port. NextAuth's
        // reqWithEnvURL() rewrites the request origin to AUTH_URL for every
        // /api/auth/* request — any mismatch causes login redirects to land on
        // the wrong host and surfaces as spurious MissingCSRF / stuck-login
        // failures in Playwright.
        // Both CI and local use `next start` (production mode). See the
        // retries comment above for why local stopped using `next dev`.
        // PORT must be set explicitly because `next start -p` doesn't
        // propagate to the env that `auth-config.ts` reads at startup.
        // NEXT_PUBLIC_TEST_MODE=1 is mainly inlined at build time, but
        // keeping it on `next start` too is a belt-and-braces guard in
        // case some part of the runtime re-reads it. Suppresses the
        // Driver.js onboarding-tour auto-trigger so the tour overlay
        // doesn't cover every authenticated page in E2E sessions.
        command: `npx cross-env NODE_ENV=test NODE_OPTIONS="--max-old-space-size=4096" NEXT_IGNORE_INCORRECT_LOCKFILE=1 AUTH_TEST_MODE=1 NEXT_TEST_MODE=1 NEXT_PUBLIC_TEST_MODE=1 AUTH_URL=http://localhost:${port} NEXTAUTH_URL=http://localhost:${port} PORT=${port} npx next start -p ${port}`,
        port,
        reuseExistingServer: !isCI,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
    },
});
