/**
 * Unit tests for the pure freshness resolver.
 *
 * Coverage: every threshold transition fires for at least one input,
 * including the explicit boundary cases (warnAfterDays / staleAfterDays
 * are exclusive — `< warn` is fresh, `>= warn && < stale` is stale,
 * `>= stale` is outdated).
 */

import { resolveFreshness } from '@/components/ui/freshness';

const NOW = new Date('2026-04-30T12:00:00Z');
const days = (n: number) =>
    new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe('resolveFreshness', () => {
    it('returns level=unknown / ageDays=null for missing input', () => {
        expect(resolveFreshness(null)).toEqual({ level: 'unknown', ageDays: null });
        expect(resolveFreshness(undefined)).toEqual({ level: 'unknown', ageDays: null });
    });

    it('returns level=unknown for unparseable timestamps', () => {
        expect(resolveFreshness('not-a-date')).toEqual({
            level: 'unknown',
            ageDays: null,
        });
    });

    it('today (0d) → fresh', () => {
        expect(resolveFreshness(NOW, { now: NOW })).toEqual({
            level: 'fresh',
            ageDays: 0,
        });
    });

    it('29d ago → fresh (just under default warn threshold)', () => {
        expect(resolveFreshness(days(29), { now: NOW }).level).toBe('fresh');
    });

    it('30d ago → stale (boundary: warnAfterDays is exclusive at fresh)', () => {
        expect(resolveFreshness(days(30), { now: NOW }).level).toBe('stale');
    });

    it('60d ago → stale', () => {
        expect(resolveFreshness(days(60), { now: NOW }).level).toBe('stale');
    });

    it('89d ago → stale', () => {
        expect(resolveFreshness(days(89), { now: NOW }).level).toBe('stale');
    });

    it('90d ago → outdated (boundary: staleAfterDays is exclusive at stale)', () => {
        expect(resolveFreshness(days(90), { now: NOW }).level).toBe('outdated');
    });

    it('365d ago → outdated', () => {
        expect(resolveFreshness(days(365), { now: NOW }).level).toBe(
            'outdated',
        );
    });

    it('respects custom thresholds', () => {
        expect(
            resolveFreshness(days(8), {
                now: NOW,
                warnAfterDays: 7,
                staleAfterDays: 30,
            }).level,
        ).toBe('stale');
        expect(
            resolveFreshness(days(31), {
                now: NOW,
                warnAfterDays: 7,
                staleAfterDays: 30,
            }).level,
        ).toBe('outdated');
    });

    it('clamps future-dated timestamps to age=0 (fresh)', () => {
        const future = new Date(NOW.getTime() + 24 * 86_400_000);
        const r = resolveFreshness(future, { now: NOW });
        expect(r.level).toBe('fresh');
        expect(r.ageDays).toBe(0);
    });

    it('accepts a Date instance just like a string', () => {
        const ts = new Date(NOW.getTime() - 5 * 86_400_000);
        const r = resolveFreshness(ts, { now: NOW });
        expect(r.ageDays).toBe(5);
        expect(r.level).toBe('fresh');
    });
});
