import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
// Always use a dedicated port for E2E tests to avoid conflicts with `npm run dev` on 3000.
// This ensures E2E tests always start their own server with AUTH_TEST_MODE=1.
const port = 3006;

export default defineConfig({
    testDir: './tests/e2e',
    globalSetup: './tests/e2e/global-setup.ts',
    timeout: 180_000,
    fullyParallel: false,
    forbidOnly: isCI,
    // CI builds and runs against `next start` (production mode) — a fresh
    // pre-compiled server that handles the full serial suite cleanly, so
    // 2 retries are just belt-and-braces for remote-infra hiccups.
    //
    // Local runs hit `next dev` (see `webServer.command` below) which JIT-
    // compiles routes and leaks memory over long sessions. The 30-ish spec
    // serial suite is long enough (~35 min) that the dev server starts
    // degrading near the end — symptoms are intermittent ECONNREFUSED /
    // 30-60s selector timeouts on pages that render fine in isolation.
    // 1 retry converts those transient server-pressure flakes into a
    // self-healing run without masking deterministic regressions (a real
    // bug will fail both the original attempt and the retry).
    retries: isCI ? 2 : 1,
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
        command: isCI
            ? `npx cross-env NODE_ENV=test NODE_OPTIONS="--max-old-space-size=4096" NEXT_IGNORE_INCORRECT_LOCKFILE=1 AUTH_TEST_MODE=1 NEXT_TEST_MODE=1 AUTH_URL=http://localhost:${port} NEXTAUTH_URL=http://localhost:${port} PORT=${port} npx next start -p ${port}`
            : `npx cross-env NODE_ENV=test NODE_OPTIONS="--max-old-space-size=4096" NEXT_IGNORE_INCORRECT_LOCKFILE=1 AUTH_TEST_MODE=1 NEXT_TEST_MODE=1 AUTH_URL=http://localhost:${port} NEXTAUTH_URL=http://localhost:${port} npx next dev -p ${port}`,
        port,
        reuseExistingServer: !isCI,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
    },
});
