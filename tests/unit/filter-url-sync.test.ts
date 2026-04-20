/**
 * Epic 53 — shared URL-sync helper (`src/lib/filters/url-sync.ts`).
 *
 * Verifies the three non-negotiables the prompt calls out:
 *   1. Deterministic output — same state ⇒ same query string.
 *   2. No churn — empty keys elided, `q` emitted last, pagination cursors
 *      never leaked in by accident.
 *   3. Generic transforms — range split / comma join / single value.
 */

import type { FilterState } from '../../src/components/ui/filter/filter-state';
import {
    commaJoinedTransform,
    rangeSplitTransform,
    singleValueTransform,
    toApiQueryString,
    toApiSearchParams,
} from '../../src/lib/filters/url-sync';

describe('toApiSearchParams — defaults', () => {
    it('emits empty params for an empty state', () => {
        const params = toApiSearchParams({});
        expect(params.toString()).toBe('');
    });

    it('emits each non-empty key as comma-joined by default', () => {
        const state: FilterState = {
            status: ['OPEN', 'CLOSED'],
            owner: ['u1'],
        };
        const params = toApiSearchParams(state);
        expect(params.get('status')).toBe('OPEN,CLOSED');
        expect(params.get('owner')).toBe('u1');
    });

    it('elides empty-value keys (no `status=` or similar)', () => {
        const state: FilterState = {
            status: [],
            owner: ['u1'],
        };
        const params = toApiSearchParams(state);
        expect(params.has('status')).toBe(false);
        expect(params.get('owner')).toBe('u1');
    });

    it('emits keys in sorted order for deterministic URLs', () => {
        const state: FilterState = {
            zzz: ['late'],
            aaa: ['early'],
            mmm: ['middle'],
        };
        // URLSearchParams preserves insertion order; sorted traversal yields
        // a predictable string even when the state object's key order differs.
        const params = toApiSearchParams(state);
        const keys = [...params.keys()];
        expect(keys).toEqual(['aaa', 'mmm', 'zzz']);
    });

    it('places `search` (q) last, after all filter keys', () => {
        const state: FilterState = { status: ['OPEN'] };
        const params = toApiSearchParams(state, { search: 'foo' });
        const keys = [...params.keys()];
        expect(keys).toEqual(['status', 'q']);
        expect(params.get('q')).toBe('foo');
    });

    it('omits q when search is empty or undefined', () => {
        expect(toApiSearchParams({}, { search: '' }).has('q')).toBe(false);
        expect(toApiSearchParams({}, {}).has('q')).toBe(false);
    });

    it('does not leak pagination cursors automatically', () => {
        // Cursors are the caller's responsibility via `extras`.
        const params = toApiSearchParams({ status: ['OPEN'] });
        expect(params.has('cursor')).toBe(false);
    });

    it('appends `extras` (cursor / limit) verbatim', () => {
        const params = toApiSearchParams(
            { status: ['OPEN'] },
            { extras: { limit: '50', cursor: 'abc' } },
        );
        expect(params.get('limit')).toBe('50');
        expect(params.get('cursor')).toBe('abc');
    });

    it('skips extras whose value is undefined or empty string', () => {
        const params = toApiSearchParams({}, { extras: { limit: undefined, cursor: '' } });
        expect(params.has('limit')).toBe(false);
        expect(params.has('cursor')).toBe(false);
    });
});

describe('toApiSearchParams — transforms', () => {
    it('singleValueTransform emits only the first value', () => {
        const params = toApiSearchParams(
            { kind: ['FIRST', 'SECOND'] },
            { transforms: { kind: singleValueTransform('kind') } },
        );
        expect(params.get('kind')).toBe('FIRST');
    });

    it('commaJoinedTransform is equivalent to the default', () => {
        const params = toApiSearchParams(
            { kind: ['a', 'b'] },
            { transforms: { kind: commaJoinedTransform('kind') } },
        );
        expect(params.get('kind')).toBe('a,b');
    });

    it('commaJoinedTransform honours a custom separator + output key', () => {
        const params = toApiSearchParams(
            { kind: ['a', 'b', 'c'] },
            { transforms: { kind: commaJoinedTransform('kinds', '|') } },
        );
        expect(params.get('kinds')).toBe('a|b|c');
        expect(params.has('kind')).toBe(false);
    });

    it('rangeSplitTransform fans a "min|max" token into two API keys', () => {
        const params = toApiSearchParams(
            { score: ['30|70'] },
            { transforms: { score: rangeSplitTransform('scoreMin', 'scoreMax') } },
        );
        expect(params.get('scoreMin')).toBe('30');
        expect(params.get('scoreMax')).toBe('70');
        expect(params.has('score')).toBe(false); // original UI key not re-emitted
    });

    it('rangeSplitTransform tolerates one-sided ranges', () => {
        const leftOnly = toApiSearchParams(
            { score: ['30|'] },
            { transforms: { score: rangeSplitTransform('scoreMin', 'scoreMax') } },
        );
        expect(leftOnly.get('scoreMin')).toBe('30');
        expect(leftOnly.has('scoreMax')).toBe(false);

        const rightOnly = toApiSearchParams(
            { score: ['|70'] },
            { transforms: { score: rangeSplitTransform('scoreMin', 'scoreMax') } },
        );
        expect(rightOnly.has('scoreMin')).toBe(false);
        expect(rightOnly.get('scoreMax')).toBe('70');
    });

    it('rangeSplitTransform drops the sentinel "|" (no bounds applied)', () => {
        const params = toApiSearchParams(
            { score: ['|'] },
            { transforms: { score: rangeSplitTransform('scoreMin', 'scoreMax') } },
        );
        expect(params.has('scoreMin')).toBe(false);
        expect(params.has('scoreMax')).toBe(false);
    });
});

describe('toApiQueryString', () => {
    it('returns an empty string for an empty state', () => {
        expect(toApiQueryString({})).toBe('');
    });

    it('prepends `?` when any params are present', () => {
        expect(toApiQueryString({ status: ['OPEN'] })).toBe('?status=OPEN');
    });
});

// ─── Determinism: same state → same string ──────────────────────────

describe('Determinism', () => {
    it('produces the same string regardless of object property order', () => {
        const a = toApiQueryString({ b: ['2'], a: ['1'], c: ['3'] });
        const b = toApiQueryString({ a: ['1'], c: ['3'], b: ['2'] });
        expect(a).toBe(b);
    });

    it('produces the same string across repeated calls', () => {
        const state: FilterState = { status: ['OPEN', 'CLOSED'], owner: ['u1'] };
        expect(toApiQueryString(state)).toBe(toApiQueryString(state));
    });
});
