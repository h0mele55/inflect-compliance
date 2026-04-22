import { NextRequest } from 'next/server';

// Mock the checkAuthRateLimit to just pass
jest.mock('../../src/lib/rate-limit/authRateLimit', () => ({
    checkAuthRateLimit: jest.fn().mockResolvedValue({ ok: true })
}));

// Mock next-auth itself so we don't load the ESM module. Middleware
// instantiates `auth()` from authConfig via `NextAuth(authConfig)` at
// module scope — this mock replaces that boot-time wiring with a
// pass-through that lets the middleware's body run normally.
jest.mock('next-auth', () => ({
    __esModule: true,
    default: jest.fn(() => ({
        auth: (handler: (req: unknown) => unknown) => handler,
    })),
}));

// The edge auth config imports @/env — for the CORS-only unit test
// we don't need real OAuth provider wiring.
jest.mock('../../src/auth.config', () => ({
    __esModule: true,
    default: { providers: [], session: { strategy: 'jwt' }, pages: {} },
}));

import middleware from '../../src/middleware';

describe('CORS Middleware Logic', () => {
    let originalCorsEnv: string | undefined;

    beforeAll(() => {
        originalCorsEnv = process.env.CORS_ALLOWED_ORIGINS;
    });

    afterAll(() => {
        process.env.CORS_ALLOWED_ORIGINS = originalCorsEnv;
    });

    function createMockRequest(method: string, pathname: string, origin?: string) {
        const headers = new Headers();
        if (origin) headers.set('origin', origin);

        return new NextRequest(`http://localhost:3000${pathname}`, {
            method,
            headers,
        });
    }

    it('should return CORS preflight headers for allowed origins on OPTIONS request', async () => {
        process.env.CORS_ALLOWED_ORIGINS = 'https://myapp.com,https://staging.myapp.com';

        const req = createMockRequest('OPTIONS', '/api/test', 'https://myapp.com');
        const res = await middleware(req, {} as any);

        expect(res.status).toBe(204);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://myapp.com');
        expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
        expect(res.headers.get('Access-Control-Allow-Methods')).toContain('OPTIONS');
    });

    it('should return default CORS preflight without specific Origin if disallowed', async () => {
        process.env.CORS_ALLOWED_ORIGINS = 'https://myapp.com';

        const req = createMockRequest('OPTIONS', '/api/test', 'https://evilsite.com');
        const res = await middleware(req, {} as any);

        expect(res.status).toBe(204);
        // It does not echo the evil site for allow-origin
        expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('should correctly handle localhost dynamically without env var in Dev', async () => {
        process.env.CORS_ALLOWED_ORIGINS = '';

        const req = createMockRequest('OPTIONS', '/api/test', 'http://localhost:3001');
        const res = await middleware(req, {} as any);

        expect(res.status).toBe(204);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3001');
    });

    it('should append Vary and Allow-Origin to normal API GET requests from allowed origin', async () => {
        process.env.CORS_ALLOWED_ORIGINS = 'https://myapp.com';

        const req = createMockRequest('GET', '/api/data', 'https://myapp.com');
        const res = await middleware(req, {} as any);

        // Next.js middleware passes through if auth passes
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://myapp.com');
        expect(res.headers.get('Vary')).toBe('Origin');
        expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    });

    it('should NOT append Allow-Origin to normal API GET responses for disallowed origin', async () => {
        process.env.CORS_ALLOWED_ORIGINS = 'https://myapp.com';

        const req = createMockRequest('GET', '/api/data', 'https://evilsite.com');
        const res = await middleware(req, {} as any);

        expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
});
