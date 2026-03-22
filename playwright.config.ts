import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
// Always use a dedicated port for E2E tests to avoid conflicts with `npm run dev` on 3000.
// This ensures E2E tests always start their own server with AUTH_TEST_MODE=1.
const port = 3006;

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 180_000,
    fullyParallel: false,
    forbidOnly: isCI,
    retries: isCI ? 2 : 0,
    workers: 1,
    reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: `http://localhost:${port}`,
        trace: 'on-first-retry',
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
        command: isCI
            ? `npx cross-env AUTH_TEST_MODE=1 PORT=${port} npx next start -p ${port}`
            : `npx cross-env AUTH_TEST_MODE=1 npx next dev -p ${port}`,
        port,
        reuseExistingServer: !isCI,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
    },
});
