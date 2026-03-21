/**
 * PDF Table Helper — Unit Tests
 */
import { autoColumnWidths } from '@/lib/pdf/table';
import { CONTENT_WIDTH } from '@/lib/pdf/pdfKitFactory';

describe('autoColumnWidths', () => {
    it('distributes widths proportionally', () => {
        const widths = autoColumnWidths([1, 1, 1]);
        expect(widths).toHaveLength(3);
        // Each should be roughly 1/3 of content width
        const third = CONTENT_WIDTH / 3;
        for (const w of widths) {
            expect(w).toBeCloseTo(third, 1);
        }
    });

    it('sums to CONTENT_WIDTH', () => {
        const widths = autoColumnWidths([2, 3, 1, 4]);
        const total = widths.reduce((s, w) => s + w, 0);
        expect(total).toBeCloseTo(CONTENT_WIDTH, 1);
    });

    it('respects relative weights', () => {
        const widths = autoColumnWidths([1, 3]);
        // First column should be ~25%, second ~75%
        expect(widths[1]).toBeCloseTo(widths[0] * 3, 1);
    });

    it('handles single column', () => {
        const widths = autoColumnWidths([1]);
        expect(widths[0]).toBeCloseTo(CONTENT_WIDTH, 1);
    });
});
