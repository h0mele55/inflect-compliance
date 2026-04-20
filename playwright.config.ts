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
    retries: isCI ? 2 : 0,
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
