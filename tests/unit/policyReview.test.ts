import { isPolicyOverdue, daysOverdue } from '@/app-layer/jobs/policyReviewReminder';

describe('Policy Review Overdue Detection', () => {
    const NOW = new Date('2026-03-05T12:00:00Z');

    describe('isPolicyOverdue', () => {
        it('returns false when nextReviewAt is null', () => {
            expect(isPolicyOverdue(null, NOW)).toBe(false);
        });

        it('returns false when nextReviewAt is undefined', () => {
            expect(isPolicyOverdue(undefined, NOW)).toBe(false);
        });

        it('returns false when nextReviewAt is in the future', () => {
            expect(isPolicyOverdue(new Date('2026-04-01'), NOW)).toBe(false);
        });

        it('returns false when nextReviewAt equals now', () => {
            expect(isPolicyOverdue(NOW, NOW)).toBe(false);
        });

        it('returns true when nextReviewAt is in the past', () => {
            expect(isPolicyOverdue(new Date('2026-02-01'), NOW)).toBe(true);
        });

        it('returns true when nextReviewAt was yesterday', () => {
            expect(isPolicyOverdue(new Date('2026-03-04'), NOW)).toBe(true);
        });
    });

    describe('daysOverdue', () => {
        it('returns 0 when nextReviewAt is null', () => {
            expect(daysOverdue(null, NOW)).toBe(0);
        });

        it('returns 0 when nextReviewAt is in the future', () => {
            expect(daysOverdue(new Date('2026-04-01'), NOW)).toBe(0);
        });

        it('returns 0 when nextReviewAt equals now', () => {
            expect(daysOverdue(NOW, NOW)).toBe(0);
        });

        it('returns 1 when nextReviewAt was yesterday', () => {
            expect(daysOverdue(new Date('2026-03-04T12:00:00Z'), NOW)).toBe(1);
        });

        it('returns 32 when nextReviewAt was 32 days ago', () => {
            expect(daysOverdue(new Date('2026-02-01T12:00:00Z'), NOW)).toBe(32);
        });

        it('returns correct number for partial days', () => {
            // 12 hours ago should be 0 full days overdue
            expect(daysOverdue(new Date('2026-03-05T00:00:00Z'), NOW)).toBe(0);
        });
    });
});
