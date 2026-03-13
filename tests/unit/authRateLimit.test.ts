import { NextRequest } from 'next/server';
import { checkAuthRateLimit } from '@/lib/rate-limit/authRateLimit';

describe('Auth Rate Limit Module', () => {
    beforeEach(() => {
        // Force the environment to memory mode for testing
        process.env.RATE_LIMIT_ENABLED = '1';
        process.env.RATE_LIMIT_MODE = 'memory';
        // Ensure rate limiting is NOT skipped (AUTH_TEST_MODE bypasses rate limiting)
        delete process.env.AUTH_TEST_MODE;
    });

    function createMockRequest(path: string, ip: string = '127.0.0.1') {
        const req = new NextRequest(`http://localhost${path}`);
        // Mocking IP directly isn't possible on NextRequest, so we mock headers
        req.headers.set('x-forwarded-for', ip);
        req.headers.set('user-agent', 'test-agent');
        return req;
    }

    it('allows a low risk request and returns headers', async () => {
        const req = createMockRequest('/api/auth/csrf', '1.1.1.1');
        const result = await checkAuthRateLimit(req);

        expect(result.ok).toBe(true);
        expect(result.headers).toBeDefined();
        expect(result.headers?.get('X-RateLimit-Limit')).toBe('60');
    });

    it('blocks a high risk request after 10 tries', async () => {
        const ip = '2.2.2.2';

        // 10 successful requests
        for (let i = 0; i < 10; i++) {
            const req = createMockRequest('/api/auth/signin', ip);
            const result = await checkAuthRateLimit(req);
            expect(result.ok).toBe(true);
        }

        // 11th should fail
        const req11 = createMockRequest('/api/auth/signin', ip);
        const result11 = await checkAuthRateLimit(req11);

        expect(result11.ok).toBe(false);
        expect(result11.response).toBeDefined();

        // Check 429 response formatting
        expect(result11.response?.status).toBe(429);
        const data = await result11.response?.json();
        expect(data.error).toBe('RATE_LIMITED');
        expect(data.retryAfterSeconds).toBeGreaterThan(0);

        const headers = result11.response?.headers;
        expect(headers?.get('Retry-After')).toBeDefined();
    });

    it('isolates tiers: exhausting high risk does not exhaust low risk', async () => {
        const ip = '3.3.3.3';

        // Exhaust High risk
        for (let i = 0; i < 11; i++) {
            await checkAuthRateLimit(createMockRequest('/api/auth/signin', ip));
        }

        const highResult = await checkAuthRateLimit(createMockRequest('/api/auth/signin', ip));
        expect(highResult.ok).toBe(false);

        // Low risk should still be fine
        const lowResult = await checkAuthRateLimit(createMockRequest('/api/auth/csrf', ip));
        expect(lowResult.ok).toBe(true);
    });

    it('isolates IPs: exhausting limit for IP A does not affect IP B', async () => {
        const ipA = '4.4.4.4';
        const ipB = '5.5.5.5';

        // Exhaust High risk for IP A
        for (let i = 0; i < 11; i++) {
            await checkAuthRateLimit(createMockRequest('/api/auth/signin', ipA));
        }

        // IP B should be fine
        const resultB = await checkAuthRateLimit(createMockRequest('/api/auth/signin', ipB));
        expect(resultB.ok).toBe(true);
    });

    it('disables completely if RATE_LIMIT_ENABLED is 0', async () => {
        process.env.RATE_LIMIT_ENABLED = '0';
        const req = createMockRequest('/api/auth/signin', '6.6.6.6');
        const result = await checkAuthRateLimit(req);

        expect(result.ok).toBe(true);
        expect(result.headers).toBeUndefined();
    });
});
