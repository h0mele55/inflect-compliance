import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 60_000,
    fullyParallel: false,
    forbidOnly: isCI,
    retries: isCI ? 2 : 0,
    workers: 1,
    reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: 'http://localhost:3006',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: isCI
            ? 'npx cross-env AUTH_TEST_MODE=1 PORT=3006 npx next start -p 3006'
            : 'npx cross-env AUTH_TEST_MODE=1 npx next dev -p 3006',
        port: 3006,
        reuseExistingServer: !isCI,
        timeout: 120_000,
    },
});
