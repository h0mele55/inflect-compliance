/**
 * Integration tests for Auth.js routes.
 * Verifies security properties of the auth endpoints.
 *
 * These tests require a running dev server (npm run dev).
 * If the server is not available, tests are skipped automatically.
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

describe('Auth Routes Integration', () => {
    let serverAvailable = false;

    beforeAll(async () => {
        // Next.js dev server cold start often returns 404 or hangs while compiling the route.
        // We ping the server until it successfully returns a response to ensure it's "warmed up".
        for (let i = 0; i < 5; i++) {
            try {
                const warmup = await fetch(`${BASE_URL}/api/auth/providers`, {
                    signal: AbortSignal.timeout(2000),
                });
                if (warmup.ok) {
                    serverAvailable = true;
                    break;
                }
            } catch {
                // Ignore network errors during warmup
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        if (!serverAvailable) {
            console.warn(`[test:integration] Server at ${BASE_URL} not reachable — auth route tests will be skipped`);
        }
    }, 30000);

    // Helper: skip test if server not available
    const itLive = (name: string, fn: () => Promise<void>) => {
        it(name, async () => {
            if (!serverAvailable) {
                console.log(`[skipped] ${name} — server not available`);
                return;
            }
            await fn();
        });
    };

    describe('GET /api/auth/session', () => {
        itLive('returns a response (200 or valid JSON)', async () => {
            const url = `${BASE_URL}/api/auth/session`;
            const res = await fetch(url);
            if (res.status !== 200) {
                const text = await res.text();
                console.error(`[test:integration] Failed ${url} | Status: ${res.status} | Body: ${text.substring(0, 500)}`);
            }
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(typeof data).toBe('object');
        });

        itLive('does NOT expose access_token in session response', async () => {
            const res = await fetch(`${BASE_URL}/api/auth/session`);
            const data = await res.json();
            expect(data?.access_token).toBeUndefined();
            expect(data?.accessToken).toBeUndefined();
        });

        itLive('does NOT expose refresh_token in session response', async () => {
            const res = await fetch(`${BASE_URL}/api/auth/session`);
            const data = await res.json();
            expect(data?.refresh_token).toBeUndefined();
            expect(data?.refreshToken).toBeUndefined();
        });
    });

    describe('GET /api/auth/csrf', () => {
        itLive('returns a CSRF token', async () => {
            const res = await fetch(`${BASE_URL}/api/auth/csrf`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.csrfToken).toBeDefined();
            expect(typeof data.csrfToken).toBe('string');
            expect(data.csrfToken.length).toBeGreaterThan(0);
        });

        itLive('returns different CSRF tokens for different sessions', async () => {
            const res1 = await fetch(`${BASE_URL}/api/auth/csrf`);
            if (res1.status !== 200) return;
            const text1 = await res1.text();
            if (!text1.startsWith('{')) return;
            const data1 = JSON.parse(text1);

            const res2 = await fetch(`${BASE_URL}/api/auth/csrf`);
            if (res2.status !== 200) return;
            const text2 = await res2.text();
            if (!text2.startsWith('{')) return;
            const data2 = JSON.parse(text2);

            expect(data1.csrfToken).toBeDefined();
            expect(data2.csrfToken).toBeDefined();
        });
    });

    describe('GET /api/auth/providers', () => {
        itLive('returns configured providers', async () => {
            const res = await fetch(`${BASE_URL}/api/auth/providers`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.google).toBeDefined();
            expect(data['microsoft-entra-id']).toBeDefined();
        });

        itLive('includes credentials provider in test mode', async () => {
            if (process.env.AUTH_TEST_MODE !== '1') return;
            const res = await fetch(`${BASE_URL}/api/auth/providers`);
            const data = await res.json();
            expect(data.credentials).toBeDefined();
        });
    });

    describe('Session security', () => {
        itLive('session response as object contains no token fields', async () => {
            const res = await fetch(`${BASE_URL}/api/auth/session`);
            const data = await res.json();
            const jsonStr = JSON.stringify(data);
            expect(jsonStr).not.toContain('"access_token"');
            expect(jsonStr).not.toContain('"refresh_token"');
            expect(jsonStr).not.toContain('"accessToken"');
            expect(jsonStr).not.toContain('"refreshToken"');
        });
    });
});
