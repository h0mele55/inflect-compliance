/**
 * Epic A.2 rollout — the shared `withApiErrorHandling` wrapper now
 * enforces rate limits on POST/PUT/DELETE/PATCH by default.
 *
 * This test activates the limiter (the NODE_ENV=test bypass is
 * off because RATE_LIMIT_ENABLED is explicitly '1' at the top of
 * this file) and proves:
 *
 *   - Mutation methods get API_MUTATION_LIMIT by default.
 *   - GET / HEAD / OPTIONS are never limited.
 *   - A route can override via `{ rateLimit: { config, scope } }`.
 *   - A route can opt out via `{ rateLimit: false }`.
 *   - The 429 response flows through the shared wrapper —
 *     `x-request-id` is set, `Retry-After` is present, body shape is
 *     canonical.
 *   - Bypass respects the env vars even when enabled elsewhere.
 */

const originalEnv = process.env.RATE_LIMIT_ENABLED;

beforeAll(() => {
    // Force the wrapper to enforce (tests default-bypass otherwise).
    process.env.RATE_LIMIT_ENABLED = '1';
});

afterAll(() => {
    if (originalEnv === undefined) delete process.env.RATE_LIMIT_ENABLED;
    else process.env.RATE_LIMIT_ENABLED = originalEnv;
});

import { NextRequest, NextResponse } from 'next/server';
import { withApiErrorHandling } from '@/lib/errors/api';
import {
    clearAllRateLimits,
    API_KEY_CREATE_LIMIT,
} from '@/lib/security/rate-limit-middleware';

function req(
    method: string,
    options: { path?: string; ip?: string } = {},
): NextRequest {
    const headers = new Headers();
    if (options.ip) headers.set('x-forwarded-for', options.ip);
    return new NextRequest(
        `http://localhost${options.path ?? '/api/test'}`,
        { method, headers },
    );
}

describe('withApiErrorHandling — default mutation rate limiting', () => {
    beforeEach(() => {
        clearAllRateLimits();
    });

    test('POST without options uses API_MUTATION_LIMIT (60/min) and passes under budget', async () => {
        const handler = jest.fn(async () =>
            NextResponse.json({ ok: true }),
        );
        const wrapped = withApiErrorHandling(handler);

        for (let i = 0; i < 60; i++) {
            const res = await wrapped(req('POST', { ip: '1.1.1.1' }), {});
            expect(res.status).toBe(200);
        }
        expect(handler).toHaveBeenCalledTimes(60);
    });

    test('POST over budget returns 429 with Retry-After + x-request-id + canonical body', async () => {
        const handler = jest.fn(async () =>
            NextResponse.json({ ok: true }),
        );
        const wrapped = withApiErrorHandling(handler);

        // Drain the 60/min budget.
        for (let i = 0; i < 60; i++) {
            await wrapped(req('POST', { ip: '2.2.2.2' }), {});
        }
        const blocked = await wrapped(req('POST', { ip: '2.2.2.2' }), {});

        expect(blocked.status).toBe(429);
        expect(blocked.headers.get('Retry-After')).toMatch(/^\d+$/);
        expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
        expect(blocked.headers.get('x-request-id')).toBeTruthy();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = await blocked.json();
        expect(body.error.code).toBe('RATE_LIMITED');
        expect(body.error.scope).toBe('api-mutation');
        expect(body.error.retryAfterSeconds).toBeGreaterThan(0);
    });

    test.each(['GET', 'HEAD', 'OPTIONS'])(
        '%s is never rate-limited regardless of budget state',
        async (method) => {
            const handler = jest.fn(async () =>
                NextResponse.json({ ok: true }),
            );
            const wrapped = withApiErrorHandling(handler);
            for (let i = 0; i < 100; i++) {
                const res = await wrapped(req(method, { ip: '3.3.3.3' }), {});
                expect(res.status).toBe(200);
            }
        },
    );

    test.each(['PUT', 'DELETE', 'PATCH'])(
        '%s is rate-limited by default like POST',
        async (method) => {
            const handler = jest.fn(async () =>
                NextResponse.json({ ok: true }),
            );
            const wrapped = withApiErrorHandling(handler);
            for (let i = 0; i < 60; i++) {
                await wrapped(req(method, { ip: `5.5.5.${method.length}` }), {});
            }
            const blocked = await wrapped(
                req(method, { ip: `5.5.5.${method.length}` }),
                {},
            );
            expect(blocked.status).toBe(429);
        },
    );
});

describe('withApiErrorHandling — custom rateLimit option', () => {
    beforeEach(() => {
        clearAllRateLimits();
    });

    test('override config tightens the budget (API_KEY_CREATE_LIMIT)', async () => {
        const handler = jest.fn(async () =>
            NextResponse.json({ ok: true }),
        );
        const wrapped = withApiErrorHandling(handler, {
            rateLimit: {
                config: API_KEY_CREATE_LIMIT, // 5/hr
                scope: 'api-key-create',
            },
        });

        for (let i = 0; i < 5; i++) {
            const res = await wrapped(req('POST', { ip: '6.6.6.6' }), {});
            expect(res.status).toBe(200);
        }
        const sixth = await wrapped(req('POST', { ip: '6.6.6.6' }), {});
        expect(sixth.status).toBe(429);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = await sixth.json();
        expect(body.error.scope).toBe('api-key-create');
    });

    test('rateLimit: false disables enforcement even on POST', async () => {
        const handler = jest.fn(async () =>
            NextResponse.json({ ok: true }),
        );
        const wrapped = withApiErrorHandling(handler, { rateLimit: false });

        for (let i = 0; i < 200; i++) {
            const res = await wrapped(req('POST', { ip: '7.7.7.7' }), {});
            expect(res.status).toBe(200);
        }
    });

    test('getUserId resolver keys by user — different users share an IP independently', async () => {
        const handler = jest.fn(async () =>
            NextResponse.json({ ok: true }),
        );
        const wrapped = withApiErrorHandling(handler, {
            rateLimit: {
                config: { maxAttempts: 1, windowMs: 60_000 },
                scope: 'per-user',
                getUserId: async (r) =>
                    r.headers.get('x-test-user') ?? null,
            },
        });

        const alice = new NextRequest('http://localhost/x', {
            method: 'POST',
            headers: { 'x-forwarded-for': '8.8.8.8', 'x-test-user': 'alice' },
        });
        const bob = new NextRequest('http://localhost/x', {
            method: 'POST',
            headers: { 'x-forwarded-for': '8.8.8.8', 'x-test-user': 'bob' },
        });

        expect((await wrapped(alice, {})).status).toBe(200);
        expect((await wrapped(bob, {})).status).toBe(200);
        // Alice's second hit blocked; Bob independent.
        const aliceAgain = new NextRequest('http://localhost/x', {
            method: 'POST',
            headers: { 'x-forwarded-for': '8.8.8.8', 'x-test-user': 'alice' },
        });
        expect((await wrapped(aliceAgain, {})).status).toBe(429);
    });

    test('custom scope isolates from the default mutation bucket', async () => {
        const defaultWrapped = withApiErrorHandling(async () =>
            NextResponse.json({ ok: true }),
        );
        const customWrapped = withApiErrorHandling(
            async () => NextResponse.json({ ok: true }),
            {
                rateLimit: {
                    config: { maxAttempts: 2, windowMs: 60_000 },
                    scope: 'isolated',
                },
            },
        );

        // Drain the isolated bucket (2 attempts).
        await customWrapped(req('POST', { ip: '9.9.9.9' }), {});
        await customWrapped(req('POST', { ip: '9.9.9.9' }), {});
        const blocked = await customWrapped(req('POST', { ip: '9.9.9.9' }), {});
        expect(blocked.status).toBe(429);

        // Default bucket is independent — still allowed.
        const defaultRes = await defaultWrapped(
            req('POST', { ip: '9.9.9.9' }),
            {},
        );
        expect(defaultRes.status).toBe(200);
    });
});

describe('withApiErrorHandling — env-based bypass', () => {
    beforeEach(() => {
        clearAllRateLimits();
    });

    test('RATE_LIMIT_ENABLED=0 disables rate limiting even when NODE_ENV!=test', async () => {
        const saved = process.env.RATE_LIMIT_ENABLED;
        process.env.RATE_LIMIT_ENABLED = '0';
        try {
            const wrapped = withApiErrorHandling(async () =>
                NextResponse.json({ ok: true }),
            );
            for (let i = 0; i < 200; i++) {
                const res = await wrapped(req('POST', { ip: '11.1.1.1' }), {});
                expect(res.status).toBe(200);
            }
        } finally {
            process.env.RATE_LIMIT_ENABLED = saved;
        }
    });
});
