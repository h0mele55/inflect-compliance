/**
 * Epic 62 — `isAllEvidenceCurrent` decision matrix.
 *
 * The helper is the source of truth for the
 * `evidence-all-current` milestone trigger. Tests pin every
 * disqualifying condition so a "tweak the freshness threshold"
 * change can't silently move the milestone goalposts.
 */
import {
    isAllEvidenceCurrent,
    type EvidenceFreshnessRow,
} from '@/lib/evidence-freshness';

const NOW = new Date('2026-05-03T00:00:00Z');
const DAY = 86_400_000;

function days(ago: number): string {
    return new Date(NOW.getTime() - ago * DAY).toISOString();
}

describe('isAllEvidenceCurrent', () => {
    it('returns false on an empty workspace (no rows)', () => {
        expect(isAllEvidenceCurrent([], { now: NOW })).toBe(false);
    });

    it('returns true when every active row is fresh (under 30 days)', () => {
        const rows: EvidenceFreshnessRow[] = [
            { updatedAt: days(1) },
            { updatedAt: days(15) },
            { updatedAt: days(29) },
        ];
        expect(isAllEvidenceCurrent(rows, { now: NOW })).toBe(true);
    });

    it('returns false when any active row is stale (30–89 days)', () => {
        const rows: EvidenceFreshnessRow[] = [
            { updatedAt: days(1) },
            { updatedAt: days(45) }, // stale
        ];
        expect(isAllEvidenceCurrent(rows, { now: NOW })).toBe(false);
    });

    it('returns false when any active row is outdated (>= 90 days)', () => {
        const rows: EvidenceFreshnessRow[] = [
            { updatedAt: days(1) },
            { updatedAt: days(120) }, // outdated
        ];
        expect(isAllEvidenceCurrent(rows, { now: NOW })).toBe(false);
    });

    it('returns false when any active row is hard-expired', () => {
        const rows: EvidenceFreshnessRow[] = [
            { updatedAt: days(1) },
            { updatedAt: days(2), expiredAt: days(0) },
        ];
        expect(isAllEvidenceCurrent(rows, { now: NOW })).toBe(false);
    });

    it('archived rows are ignored (not part of the active set)', () => {
        const rows: EvidenceFreshnessRow[] = [
            { updatedAt: days(1) },
            { updatedAt: days(180), isArchived: true },
        ];
        expect(isAllEvidenceCurrent(rows, { now: NOW })).toBe(true);
    });

    it('soft-deleted rows are ignored', () => {
        const rows: EvidenceFreshnessRow[] = [
            { updatedAt: days(1) },
            { updatedAt: days(180), deletedAt: days(2) },
        ];
        expect(isAllEvidenceCurrent(rows, { now: NOW })).toBe(true);
    });

    it('falls back to dateCollected when updatedAt is missing', () => {
        const rows: EvidenceFreshnessRow[] = [
            { dateCollected: days(5) },
        ];
        expect(isAllEvidenceCurrent(rows, { now: NOW })).toBe(true);
    });

    it('row with no anchor date counts as not-current', () => {
        const rows: EvidenceFreshnessRow[] = [
            { updatedAt: days(1) },
            { /* no dates at all */ },
        ];
        expect(isAllEvidenceCurrent(rows, { now: NOW })).toBe(false);
    });

    it('honours custom thresholds', () => {
        const rows: EvidenceFreshnessRow[] = [{ updatedAt: days(20) }];
        // Default 30-day warn → fresh.
        expect(isAllEvidenceCurrent(rows, { now: NOW })).toBe(true);
        // Tighten to 7 days → row is now stale → not all current.
        expect(
            isAllEvidenceCurrent(rows, { now: NOW, warnAfterDays: 7 }),
        ).toBe(false);
    });

    it('all-archived workspace is not a milestone (still empty active)', () => {
        const rows: EvidenceFreshnessRow[] = [
            { updatedAt: days(1), isArchived: true },
            { updatedAt: days(2), isArchived: true },
        ];
        expect(isAllEvidenceCurrent(rows, { now: NOW })).toBe(false);
    });
});
