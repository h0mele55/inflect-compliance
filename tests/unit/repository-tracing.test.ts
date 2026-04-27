/**
 * Epic OI-3 — repository-tracing helper tests.
 *
 * Covers:
 *   - traceRepository wraps the inner fn in a span + records metrics
 *   - result count is auto-detected from arrays / { items } / { count }
 *   - error path still records duration + error counter, then re-throws
 *   - tenant_id is on the span (queryable in trace search) but the
 *     METRIC label set is restricted to { repo.method, outcome }
 *     (cardinality safety)
 *   - detectResultCount handles all the documented shapes correctly
 */
import { jest } from '@jest/globals';

// ─── Mocks (BEFORE importing the helper) ──────────────────────────

const mockSpanSetAttributes = jest.fn();
const mockSpanSetAttribute = jest.fn();
const mockSpanSetStatus = jest.fn();
const mockSpanRecordException = jest.fn();
const mockSpanEnd = jest.fn();

const mockSpan = {
    setAttributes: mockSpanSetAttributes,
    setAttribute: mockSpanSetAttribute,
    setStatus: mockSpanSetStatus,
    recordException: mockSpanRecordException,
    end: mockSpanEnd,
};

const mockStartActiveSpan = jest.fn(
    async (_name: string, fn: (span: typeof mockSpan) => Promise<unknown>) => {
        return fn(mockSpan);
    },
) as unknown as <R>(
    name: string,
    fn: (span: typeof mockSpan) => Promise<R>,
) => Promise<R>;

jest.mock('@/lib/observability/tracing', () => ({
    getTracer: () => ({ startActiveSpan: mockStartActiveSpan }),
}));

// Metrics — capture every recorded value so we can assert label sets.
const mockDurationRecord = jest.fn();
const mockCallsAdd = jest.fn();
const mockErrorsAdd = jest.fn();
const mockResultCountRecord = jest.fn();

jest.mock('@/lib/observability/metrics', () => ({
    getRepositoryDurationHistogram: () => ({ record: mockDurationRecord }),
    getRepositoryCallCounter: () => ({ add: mockCallsAdd }),
    getRepositoryErrorCounter: () => ({ add: mockErrorsAdd }),
    getRepositoryResultCountHistogram: () => ({ record: mockResultCountRecord }),
}));

import { traceRepository, detectResultCount } from '@/lib/observability/repository-tracing';
import type { RequestContext } from '@/app-layer/types';

// ─── Test ctx fixture ─────────────────────────────────────────────

const ctx: RequestContext = {
    tenantId: 'tenant-abc',
    userId: 'user-1',
    role: 'EDITOR',
    requestId: 'req-xyz',
} as RequestContext;

beforeEach(() => {
    jest.clearAllMocks();
});

describe('OI-3 detectResultCount', () => {
    it('returns array.length for arrays', () => {
        expect(detectResultCount([1, 2, 3])).toBe(3);
        expect(detectResultCount([])).toBe(0);
    });

    it('returns items.length for { items: [...] } DTOs (paginated responses)', () => {
        expect(detectResultCount({ items: [1, 2], cursor: 'x' })).toBe(2);
    });

    it('returns count for { count: N } (Prisma count() shape)', () => {
        expect(detectResultCount({ count: 42 })).toBe(42);
    });

    it('returns null for shapes without a discoverable count', () => {
        expect(detectResultCount(null)).toBeNull();
        expect(detectResultCount(undefined)).toBeNull();
        expect(detectResultCount('a string')).toBeNull();
        expect(detectResultCount(42)).toBeNull();
        expect(detectResultCount({ id: 'x', name: 'y' })).toBeNull(); // single object
    });

    it('prefers items[].length over a count field if both present', () => {
        // Edge case — items wins because it's the modern paginated shape.
        // Tests that the implementation order matches docs.
        expect(detectResultCount({ items: [1, 2, 3], count: 99 })).toBe(3);
    });
});

describe('OI-3 traceRepository — happy path', () => {
    it('returns the inner fn result unchanged', async () => {
        const result = await traceRepository('test.method', ctx, async () => [1, 2, 3]);
        expect(result).toEqual([1, 2, 3]);
    });

    it('starts a span named `repo.<method>`', async () => {
        await traceRepository('risk.list', ctx, async () => []);
        expect(mockStartActiveSpan).toHaveBeenCalledWith('repo.risk.list', expect.any(Function));
    });

    it('sets repo.method + tenant_id + user/role/request attributes on the span', async () => {
        await traceRepository('risk.list', ctx, async () => []);
        expect(mockSpanSetAttributes).toHaveBeenCalledWith(
            expect.objectContaining({
                'repo.method': 'risk.list',
                'repo.tenant_id': 'tenant-abc',
                'app.tenantId': 'tenant-abc',
                'app.userId': 'user-1',
                'app.role': 'EDITOR',
                'app.requestId': 'req-xyz',
            }),
        );
    });

    it('records the duration histogram + calls counter with success outcome', async () => {
        await traceRepository('risk.list', ctx, async () => []);
        expect(mockDurationRecord).toHaveBeenCalledWith(
            expect.any(Number),
            { 'repo.method': 'risk.list', outcome: 'success' },
        );
        expect(mockCallsAdd).toHaveBeenCalledWith(
            1,
            { 'repo.method': 'risk.list', outcome: 'success' },
        );
    });

    it('records result_count histogram for array results', async () => {
        await traceRepository('risk.list', ctx, async () => [1, 2, 3, 4, 5]);
        expect(mockResultCountRecord).toHaveBeenCalledWith(
            5,
            { 'repo.method': 'risk.list' },
        );
    });

    it('records result_count for { items: [...] } paginated DTOs', async () => {
        await traceRepository('risk.listPaginated', ctx, async () => ({
            items: [1, 2],
            cursor: 'next',
        }));
        expect(mockResultCountRecord).toHaveBeenCalledWith(
            2,
            { 'repo.method': 'risk.listPaginated' },
        );
    });

    it('records result_count for { count: N } (Prisma count())', async () => {
        await traceRepository('risk.count', ctx, async () => ({ count: 100 }));
        expect(mockResultCountRecord).toHaveBeenCalledWith(
            100,
            { 'repo.method': 'risk.count' },
        );
    });

    it('skips result_count for single-object results', async () => {
        await traceRepository('risk.findOne', ctx, async () => ({
            id: 'risk-1',
            score: 12,
        }));
        expect(mockResultCountRecord).not.toHaveBeenCalled();
    });

    it('sets repo.duration_ms and repo.result_count attributes on the span', async () => {
        await traceRepository('risk.list', ctx, async () => [1, 2]);
        expect(mockSpanSetAttribute).toHaveBeenCalledWith(
            'repo.duration_ms',
            expect.any(Number),
        );
        expect(mockSpanSetAttribute).toHaveBeenCalledWith('repo.result_count', 2);
    });

    it('always ends the span (finally block)', async () => {
        await traceRepository('any', ctx, async () => 'x');
        expect(mockSpanEnd).toHaveBeenCalledTimes(1);
    });
});

describe('OI-3 traceRepository — error path', () => {
    it('re-throws the inner error unchanged', async () => {
        const err = new Error('db failure');
        await expect(
            traceRepository('risk.list', ctx, async () => {
                throw err;
            }),
        ).rejects.toThrow('db failure');
    });

    it('records duration + calls with error outcome on failure', async () => {
        try {
            await traceRepository('risk.list', ctx, async () => {
                throw new Error('boom');
            });
        } catch {
            /* expected */
        }
        expect(mockDurationRecord).toHaveBeenCalledWith(
            expect.any(Number),
            { 'repo.method': 'risk.list', outcome: 'error' },
        );
        expect(mockCallsAdd).toHaveBeenCalledWith(
            1,
            { 'repo.method': 'risk.list', outcome: 'error' },
        );
    });

    it('records the error counter with the error.type label', async () => {
        class CustomError extends Error {
            constructor(msg: string) {
                super(msg);
                this.name = 'PrismaClientKnownRequestError';
            }
        }
        try {
            await traceRepository('risk.list', ctx, async () => {
                throw new CustomError('p2002');
            });
        } catch {
            /* expected */
        }
        expect(mockErrorsAdd).toHaveBeenCalledWith(
            1,
            { 'repo.method': 'risk.list', 'error.type': 'PrismaClientKnownRequestError' },
        );
    });

    it('still ends the span (finally block) on error', async () => {
        try {
            await traceRepository('risk.list', ctx, async () => {
                throw new Error('x');
            });
        } catch {
            /* expected */
        }
        expect(mockSpanEnd).toHaveBeenCalledTimes(1);
    });
});

describe('OI-3 traceRepository — cardinality safety', () => {
    it('the metric label set NEVER includes tenant_id, user_id, request_id', async () => {
        await traceRepository('risk.list', ctx, async () => [1]);

        // Inspect every metric record's label argument
        const allLabelObjs = [
            ...mockDurationRecord.mock.calls.map((c) => c[1]),
            ...mockCallsAdd.mock.calls.map((c) => c[1]),
            ...mockResultCountRecord.mock.calls.map((c) => c[1]),
        ];
        for (const labels of allLabelObjs) {
            expect(labels).not.toHaveProperty('tenant_id');
            expect(labels).not.toHaveProperty('repo.tenant_id');
            expect(labels).not.toHaveProperty('app.tenantId');
            expect(labels).not.toHaveProperty('user_id');
            expect(labels).not.toHaveProperty('app.userId');
            expect(labels).not.toHaveProperty('request_id');
            expect(labels).not.toHaveProperty('app.requestId');
        }
    });

    it('tenant_id IS on the span (so trace search can pivot per-tenant)', async () => {
        await traceRepository('risk.list', ctx, async () => [1]);
        const setAttributesCall = mockSpanSetAttributes.mock.calls[0]?.[0] as
            | Record<string, unknown>
            | undefined;
        expect(setAttributesCall).toBeDefined();
        // Bracket access — `toHaveProperty` interprets dots as path separators
        expect(setAttributesCall!['repo.tenant_id']).toBe('tenant-abc');
    });
});

describe('OI-3 traceRepository — missing context fields', () => {
    it('uses "unknown" placeholder when context fields are missing', async () => {
        const partialCtx = {
            tenantId: undefined,
            userId: undefined,
            role: undefined,
            requestId: undefined,
        } as unknown as RequestContext;

        await traceRepository('risk.list', partialCtx, async () => []);

        expect(mockSpanSetAttributes).toHaveBeenCalledWith(
            expect.objectContaining({
                'repo.tenant_id': 'unknown',
                'app.tenantId': 'unknown',
                'app.userId': 'unknown',
                'app.role': 'unknown',
                'app.requestId': 'unknown',
            }),
        );
    });
});
