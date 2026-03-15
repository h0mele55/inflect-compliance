/**
 * Unit tests for cursor-based pagination utilities.
 *
 * Tests:
 * - encodeCursor / decodeCursor roundtrip
 * - decodeCursor with invalid input
 * - buildCursorWhere with valid cursor
 * - buildCursorWhere with null/undefined
 * - computePageInfo with hasNextPage = true
 * - computePageInfo with hasNextPage = false
 * - clampLimit boundaries
 */

import {
    encodeCursor,
    decodeCursor,
    buildCursorWhere,
    computePageInfo,
    clampLimit,
    DEFAULT_LIMIT,
    MAX_LIMIT,
    CursorPayload,
} from '@/lib/pagination';

describe('Cursor Pagination Utilities', () => {
    const samplePayload: CursorPayload = {
        createdAt: '2025-06-15T10:30:00.000Z',
        id: 'clx123abc456',
    };

    // ─── encodeCursor / decodeCursor ───

    describe('encodeCursor / decodeCursor', () => {
        it('roundtrips correctly', () => {
            const encoded = encodeCursor(samplePayload);
            const decoded = decodeCursor(encoded);
            expect(decoded).toEqual(samplePayload);
        });

        it('produces a URL-safe base64 string', () => {
            const encoded = encodeCursor(samplePayload);
            // base64url has no +, /, or = characters
            expect(encoded).not.toMatch(/[+/=]/);
        });

        it('returns null for empty string', () => {
            expect(decodeCursor('')).toBeNull();
        });

        it('returns null for invalid base64', () => {
            expect(decodeCursor('not-valid-base64!!!')).toBeNull();
        });

        it('returns null for valid base64 but invalid JSON', () => {
            const encoded = Buffer.from('not json').toString('base64url');
            expect(decodeCursor(encoded)).toBeNull();
        });

        it('returns null for valid JSON missing required fields', () => {
            const encoded = Buffer.from(JSON.stringify({ foo: 'bar' })).toString('base64url');
            expect(decodeCursor(encoded)).toBeNull();
        });

        it('returns null for valid JSON with invalid date', () => {
            const encoded = Buffer.from(JSON.stringify({ createdAt: 'not-a-date', id: 'abc' })).toString('base64url');
            expect(decodeCursor(encoded)).toBeNull();
        });
    });

    // ─── buildCursorWhere ───

    describe('buildCursorWhere', () => {
        it('returns null for undefined cursor', () => {
            expect(buildCursorWhere(undefined)).toBeNull();
        });

        it('returns null for null cursor', () => {
            expect(buildCursorWhere(null)).toBeNull();
        });

        it('returns null for invalid cursor string', () => {
            expect(buildCursorWhere('garbage')).toBeNull();
        });

        it('returns correct where clause for valid cursor', () => {
            const cursor = encodeCursor(samplePayload);
            const where = buildCursorWhere(cursor);

            expect(where).not.toBeNull();
            expect(where).toHaveProperty('OR');

            const orClause = (where as Record<string, unknown>).OR as unknown[];
            expect(orClause).toHaveLength(2);

            // First condition: createdAt < cursor.createdAt
            const firstCondition = orClause[0] as Record<string, unknown>;
            expect(firstCondition).toHaveProperty('createdAt');
            expect((firstCondition.createdAt as Record<string, unknown>).lt).toEqual(new Date(samplePayload.createdAt));

            // Second condition: createdAt == cursor.createdAt AND id < cursor.id
            const secondCondition = orClause[1] as Record<string, unknown>;
            expect(secondCondition).toHaveProperty('AND');
        });
    });

    // ─── computePageInfo ───

    describe('computePageInfo', () => {
        const makeItem = (id: string, minutesAgo: number) => ({
            id,
            createdAt: new Date(Date.now() - minutesAgo * 60 * 1000),
        });

        it('returns hasNextPage=true when items > limit', () => {
            const items = Array.from({ length: 11 }, (_, i) => makeItem(`id-${i}`, i));
            const result = computePageInfo(items, 10);

            expect(result.hasNextPage).toBe(true);
            expect(result.trimmedItems).toHaveLength(10);
            expect(result.nextCursor).toBeDefined();
        });

        it('returns hasNextPage=false when items <= limit', () => {
            const items = Array.from({ length: 5 }, (_, i) => makeItem(`id-${i}`, i));
            const result = computePageInfo(items, 10);

            expect(result.hasNextPage).toBe(false);
            expect(result.trimmedItems).toHaveLength(5);
            expect(result.nextCursor).toBeUndefined();
        });

        it('returns hasNextPage=false for exactly limit items', () => {
            const items = Array.from({ length: 10 }, (_, i) => makeItem(`id-${i}`, i));
            const result = computePageInfo(items, 10);

            expect(result.hasNextPage).toBe(false);
            expect(result.trimmedItems).toHaveLength(10);
            expect(result.nextCursor).toBeUndefined();
        });

        it('returns empty for empty items', () => {
            const result = computePageInfo([], 10);
            expect(result.hasNextPage).toBe(false);
            expect(result.trimmedItems).toHaveLength(0);
            expect(result.nextCursor).toBeUndefined();
        });

        it('produces a decodable nextCursor', () => {
            const items = Array.from({ length: 11 }, (_, i) => makeItem(`id-${i}`, i));
            const result = computePageInfo(items, 10);

            expect(result.nextCursor).toBeDefined();
            const decoded = decodeCursor(result.nextCursor!);
            expect(decoded).not.toBeNull();
            expect(decoded!.id).toBe('id-9'); // last item of trimmed set
        });
    });

    // ─── clampLimit ───

    describe('clampLimit', () => {
        it('returns DEFAULT_LIMIT for undefined', () => {
            expect(clampLimit(undefined)).toBe(DEFAULT_LIMIT);
        });

        it('returns DEFAULT_LIMIT for null', () => {
            expect(clampLimit(null)).toBe(DEFAULT_LIMIT);
        });

        it('returns DEFAULT_LIMIT for NaN', () => {
            expect(clampLimit(NaN)).toBe(DEFAULT_LIMIT);
        });

        it('clamps to 1 for negative values', () => {
            expect(clampLimit(-5)).toBe(1);
        });

        it('clamps to MAX_LIMIT for large values', () => {
            expect(clampLimit(500)).toBe(MAX_LIMIT);
        });

        it('passes through valid values', () => {
            expect(clampLimit(25)).toBe(25);
            expect(clampLimit(1)).toBe(1);
            expect(clampLimit(MAX_LIMIT)).toBe(MAX_LIMIT);
        });
    });
});
