/**
 * Unit tests for the observability request context (AsyncLocalStorage-based).
 *
 * RUN: npx jest tests/unit/observability-context.test.ts --verbose
 */

import {
    runWithRequestContext,
    getRequestContext,
    getRequestId,
    mergeRequestContext,
} from '@/lib/observability/context';

describe('Observability Context — runWithRequestContext + getRequestContext', () => {
    it('getRequestContext returns undefined outside of runWithRequestContext', () => {
        expect(getRequestContext()).toBeUndefined();
    });

    it('getRequestId returns "unknown" outside of context', () => {
        expect(getRequestId()).toBe('unknown');
    });

    it('provides context inside runWithRequestContext (sync)', () => {
        runWithRequestContext(
            { requestId: 'req-1', startTime: 100 },
            () => {
                const ctx = getRequestContext();
                expect(ctx).toBeDefined();
                expect(ctx!.requestId).toBe('req-1');
                expect(ctx!.startTime).toBe(100);
            },
        );
    });

    it('provides context inside runWithRequestContext (async)', async () => {
        await runWithRequestContext(
            { requestId: 'req-2', startTime: 200, route: '/api/test' },
            async () => {
                // Simulate async work
                await new Promise(resolve => setTimeout(resolve, 5));
                const ctx = getRequestContext();
                expect(ctx?.requestId).toBe('req-2');
                expect(ctx?.route).toBe('/api/test');
            },
        );
    });

    it('getRequestId returns the current requestId inside context', () => {
        runWithRequestContext(
            { requestId: 'req-3', startTime: 0 },
            () => {
                expect(getRequestId()).toBe('req-3');
            },
        );
    });

    it('context is cleaned up after sync completion', () => {
        runWithRequestContext(
            { requestId: 'req-4', startTime: 0 },
            () => {
                expect(getRequestContext()).toBeDefined();
            },
        );
        expect(getRequestContext()).toBeUndefined();
    });

    it('context is cleaned up after async completion', async () => {
        await runWithRequestContext(
            { requestId: 'req-5', startTime: 0 },
            async () => {
                expect(getRequestContext()).toBeDefined();
            },
        );
        expect(getRequestContext()).toBeUndefined();
    });

    it('context is cleaned up after sync throw', () => {
        expect(() => {
            runWithRequestContext(
                { requestId: 'req-6', startTime: 0 },
                () => { throw new Error('sync throw'); },
            );
        }).toThrow('sync throw');
        expect(getRequestContext()).toBeUndefined();
    });

    it('context is cleaned up after async rejection', async () => {
        await expect(
            runWithRequestContext(
                { requestId: 'req-7', startTime: 0 },
                async () => { throw new Error('async rejection'); },
            ),
        ).rejects.toThrow('async rejection');
        expect(getRequestContext()).toBeUndefined();
    });

    it('supports nested contexts with proper isolation', async () => {
        await runWithRequestContext(
            { requestId: 'outer', startTime: 0 },
            async () => {
                expect(getRequestId()).toBe('outer');

                await runWithRequestContext(
                    { requestId: 'inner', startTime: 1 },
                    async () => {
                        expect(getRequestId()).toBe('inner');
                    },
                );

                // Outer restored after inner completes
                expect(getRequestId()).toBe('outer');
            },
        );
    });

    it('preserves context across awaited promises', async () => {
        await runWithRequestContext(
            { requestId: 'req-persist', startTime: 0 },
            async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                expect(getRequestId()).toBe('req-persist');
                await new Promise(resolve => setTimeout(resolve, 5));
                expect(getRequestId()).toBe('req-persist');
            },
        );
    });
});

describe('Observability Context — mergeRequestContext', () => {
    it('returns false when no context is active', () => {
        expect(mergeRequestContext({ tenantId: 't1' })).toBe(false);
    });

    it('enriches the current context with partial fields', () => {
        runWithRequestContext(
            { requestId: 'req-merge', startTime: 0 },
            () => {
                const merged = mergeRequestContext({ tenantId: 't1', userId: 'u1' });
                expect(merged).toBe(true);

                const ctx = getRequestContext();
                expect(ctx?.requestId).toBe('req-merge'); // unchanged
                expect(ctx?.tenantId).toBe('t1');
                expect(ctx?.userId).toBe('u1');
            },
        );
    });

    it('overrides existing optional fields', () => {
        runWithRequestContext(
            { requestId: 'req-override', startTime: 0, route: '/old' },
            () => {
                mergeRequestContext({ route: '/new' });
                expect(getRequestContext()?.route).toBe('/new');
            },
        );
    });

    it('does not allow overriding requestId or startTime', () => {
        // TypeScript prevents this at compile time, but verify behavior
        runWithRequestContext(
            { requestId: 'original', startTime: 42 },
            () => {
                // mergeRequestContext signature omits requestId and startTime,
                // so we verify they remain unchanged.
                mergeRequestContext({ tenantId: 'added' });
                const ctx = getRequestContext();
                expect(ctx?.requestId).toBe('original');
                expect(ctx?.startTime).toBe(42);
            },
        );
    });
});
