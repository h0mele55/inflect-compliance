/* eslint-disable @typescript-eslint/no-explicit-any -- this file
 * mocks NextAuth (`auth: (handler: any) => …`) and casts mock
 * NextRequest objects (`req as any, {} as any`) into the middleware
 * boundary. NextAuth's wrapped-handler shape isn't directly exported
 * as a TypeScript type, so the mock's `handler: any` mirrors the
 * runtime contract; the request casts are necessary because the
 * test constructs minimal mocks with only the fields the middleware
 * reads. */
import { NextRequest } from 'next/server';

// Mock NextAuth to avoid ESM compilation errors and bypass the actual auth logic
jest.mock('@/auth', () => ({
    auth: (handler: any) => {
        // Return a wrapped handler that just executes the passed function
        return async (req: any, ctx: any) => {
            return handler(req, ctx);
        };
    }
}));

import middleware from '@/middleware';

describe('Auth Rate Limit Integration (Middleware Direct)', () => {
    beforeEach(() => {
        // Force the environment to memory mode for deterministic testing
        process.env.RATE_LIMIT_ENABLED = '1';
        process.env.RATE_LIMIT_MODE = 'memory';
        // Ensure rate limiting is NOT skipped (AUTH_TEST_MODE bypasses rate limiting)
        delete process.env.AUTH_TEST_MODE;
    });

    function createMockRequest(path: string, ip: string) {
        const req = new NextRequest(`http://localhost${path}`);
        req.headers.set('x-forwarded-for', ip);
        return req;
    }

    it('returns a 429 Too Many Requests response after exceeding the limit on high risk endpoints', async () => {
        const ip = '10.0.0.1';

        // Limit is 10 for high risk.
        for (let i = 0; i < 10; i++) {
            const req = createMockRequest('/api/auth/signin', ip);
            const res = await middleware(req as any, {} as any) as any;

            // Should pass through to the mocked NextAuth, which will try to process it.
            // Since our mock just returns what's inside, and there's no NextAuth Response, 
            // it will actually hit the `isPublicPath` logic in middleware and return `NextResponse.next()`,
            // which has no status 429.
            expect(res?.status).not.toBe(429);
        }

        // 11th request should be blocked by our rate limiter logic injected at the top of middleware.ts
        const req11 = createMockRequest('/api/auth/signin', ip);
        const res11 = await middleware(req11 as any, {} as any) as any;

        expect(res11?.status).toBe(429);

        const data = await res11?.json();
        expect(data.error).toBe('RATE_LIMITED');
        expect(data.retryAfterSeconds).toBeDefined();
        expect(res11?.headers.get('Retry-After')).toBeDefined();
        expect(res11?.headers.get('X-RateLimit-Limit')).toBe('10');
    });

    it('does not rate limit non-auth endpoints', async () => {
        const ip = '10.0.0.2';

        // Send 70 requests to a non-auth API route
        for (let i = 0; i < 70; i++) {
            const req = createMockRequest('/api/files/test.png', ip);
            const res = await middleware(req as any, {} as any) as any;
            expect(res?.status).not.toBe(429);
        }
    });

    it('different IPs have isolated limits', async () => {
        const ipA = '10.0.0.3';
        const ipB = '10.0.0.4';

        // Exhaust IP A on high risk (limit 10)
        for (let i = 0; i < 11; i++) {
            await middleware(createMockRequest('/api/auth/callback/google', ipA) as any, {} as any);
        }

        // Verify IP A is blocked (12th request)
        const resA = await middleware(createMockRequest('/api/auth/callback/google', ipA) as any, {} as any) as any;
        expect(resA?.status).toBe(429);

        // Verify IP B is allowed
        const resB = await middleware(createMockRequest('/api/auth/callback/google', ipB) as any, {} as any) as any;
        expect(resB?.status).not.toBe(429);
    });
});
