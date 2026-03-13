import { computeNextDueAt } from '../cadence';

describe('computeNextDueAt', () => {
    const baseDate = new Date('2026-03-08T12:00:00Z');

    it('returns null for AD_HOC frequency', () => {
        expect(computeNextDueAt('AD_HOC', baseDate)).toBeNull();
    });

    it('returns null for null/undefined frequency', () => {
        expect(computeNextDueAt(null, baseDate)).toBeNull();
        expect(computeNextDueAt(undefined, baseDate)).toBeNull();
    });

    it('returns null for unknown frequency', () => {
        expect(computeNextDueAt('UNKNOWN_FREQ', baseDate)).toBeNull();
    });

    it('computes DAILY correctly (+1 day)', () => {
        const result = computeNextDueAt('DAILY', baseDate)!;
        expect(result.getDate()).toBe(9);
        expect(result.getMonth()).toBe(baseDate.getMonth());
    });

    it('computes WEEKLY correctly (+7 days)', () => {
        const result = computeNextDueAt('WEEKLY', baseDate)!;
        expect(result.getDate()).toBe(15);
    });

    it('computes MONTHLY correctly (+1 month)', () => {
        const result = computeNextDueAt('MONTHLY', baseDate)!;
        expect(result.getMonth()).toBe(3); // April
        expect(result.getDate()).toBe(8);
    });

    it('computes QUARTERLY correctly (+3 months)', () => {
        const result = computeNextDueAt('QUARTERLY', baseDate)!;
        expect(result.getMonth()).toBe(5); // June
        expect(result.getDate()).toBe(8);
    });

    it('computes ANNUALLY correctly (+1 year)', () => {
        const result = computeNextDueAt('ANNUALLY', baseDate)!;
        expect(result.getFullYear()).toBe(2027);
        expect(result.getMonth()).toBe(2); // March
    });

    it('defaults to current date if no fromDate provided', () => {
        const beforeCall = new Date();
        const result = computeNextDueAt('DAILY')!;
        expect(result.getTime()).toBeGreaterThan(beforeCall.getTime());
    });

    it('handles month end rollover for MONTHLY', () => {
        const jan31 = new Date('2026-01-31T12:00:00Z');
        const result = computeNextDueAt('MONTHLY', jan31)!;
        // Feb 31 doesn't exist — JS rolls over to March
        expect(result.getMonth()).toBe(2); // March  
    });
});
