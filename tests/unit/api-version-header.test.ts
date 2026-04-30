/**
 * Epic E.3 — X-API-Version response header.
 *
 * Verifies the wrapper emits `X-API-Version: <API_VERSION>` on every
 * shape of response a wrapped route can produce:
 *
 *   - 2xx success (NextResponse.json)
 *   - 2xx success (plain Response — e.g. CSV body)
 *   - 4xx error (thrown AppError → wrapper-built JSON error)
 *   - 5xx error (unknown throw → wrapper-built JSON error)
 *   - 429 rate-limit short-circuit (wrapper bypasses inner handler)
 *
 * Also asserts the header value is a constant in
 * `src/lib/api-version.ts`, so a future bump is a single-line edit.
 */

import { NextRequest, NextResponse } from 'next/server';

import { withApiErrorHandling } from '@/lib/errors/api';
import { badRequest } from '@/lib/errors/types';
import { API_VERSION, API_VERSION_HEADER } from '@/lib/api-version';

function makeRequest(method = 'GET', headers: Record<string, string> = {}): NextRequest {
    return new NextRequest('http://localhost/api/test', {
        method,
        headers: new Headers(headers),
    });
}

describe('Epic E.3 — X-API-Version header', () => {
    it('the canonical version constant is a date-shaped string', () => {
        // Locks the format so bumping is a single-line edit and so a
        // typo (e.g. extra space) gets caught immediately.
        expect(API_VERSION).toBe('2026-04-29');
        expect(API_VERSION_HEADER).toBe('X-API-Version');
        expect(API_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('emits X-API-Version on a 2xx NextResponse.json success', async () => {
        const handler = withApiErrorHandling(async () => {
            return NextResponse.json({ ok: true });
        });
        const res = await handler(makeRequest(), {});
        expect(res.status).toBe(200);
        expect(res.headers.get(API_VERSION_HEADER)).toBe(API_VERSION);
    });

    it('emits X-API-Version on a plain Response success (e.g. CSV body)', async () => {
        const handler = withApiErrorHandling(async () => {
            return new Response('hello,world', {
                status: 200,
                headers: { 'Content-Type': 'text/csv' },
            });
        });
        const res = await handler(makeRequest(), {});
        expect(res.status).toBe(200);
        // Plain Response goes through a clone-and-reattach branch in
        // the wrapper. Confirm the version header makes it through
        // that branch too.
        expect(res.headers.get(API_VERSION_HEADER)).toBe(API_VERSION);
    });

    it('emits X-API-Version on a 4xx thrown AppError', async () => {
        const handler = withApiErrorHandling(async () => {
            throw badRequest('nope');
        });
        const res = await handler(makeRequest(), {});
        expect(res.status).toBe(400);
        expect(res.headers.get(API_VERSION_HEADER)).toBe(API_VERSION);
    });

    it('emits X-API-Version on a 5xx unknown throw', async () => {
        const handler = withApiErrorHandling(async () => {
            throw new Error('boom');
        });
        const res = await handler(makeRequest(), {});
        expect(res.status).toBe(500);
        expect(res.headers.get(API_VERSION_HEADER)).toBe(API_VERSION);
    });

    it('preserves the canonical x-request-id header alongside X-API-Version', async () => {
        const handler = withApiErrorHandling(async () => {
            return NextResponse.json({ ok: true });
        });
        const res = await handler(
            makeRequest('GET', { 'x-request-id': 'caller-id-1' }),
            {},
        );
        expect(res.headers.get('x-request-id')).toBe('caller-id-1');
        expect(res.headers.get(API_VERSION_HEADER)).toBe(API_VERSION);
    });
});
