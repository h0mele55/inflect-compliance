/**
 * Epic 41 — KpiCard trend indicator (rendered).
 *
 * Verifies the visual side of the trend indicator added in Epic 41
 * prompt 5. Distinct from `kpi-card-trend.test.tsx` (Epic 59
 * sparkline integration) — that one covers the sparkline below the
 * value; this one covers the ▲/▼ direction arrow + percent + colour
 * row.
 *
 * Coverage:
 *   - explicit `delta` path: direction + colour under each polarity
 *   - `previousValue` path: auto-computes percent + direction
 *   - polarity flip swaps the semantic colour for the same delta
 *   - indicator hides when neither delta nor previousValue is set
 *   - zero-baseline edge case (previous=0, current>0) hides the
 *     indicator (we don't fake a percentage)
 *   - explicit `delta` wins over auto-compute when both are passed
 *
 * Direction + semantic are exposed as data-attributes on the
 * indicator element so tests assert on stable selectors instead of
 * colour classes (which the theme system can mutate).
 */

import { render } from '@testing-library/react';
import * as React from 'react';

import KpiCard from '@/components/ui/KpiCard';

function getTrend(): HTMLElement | null {
    return document.querySelector(
        '[data-kpi-trend-row] [data-kpi-trend-direction]',
    ) as HTMLElement | null;
}

describe('Epic 41 — KpiCard trend indicator', () => {
    // ─── Explicit delta path ───────────────────────────────────────

    it('positive delta + up-good polarity → semantic=good direction=up', () => {
        render(
            <KpiCard
                label="Coverage"
                value={75.3}
                format="percent"
                delta={2.4}
                trendPolarity="up-good"
            />,
        );
        const t = getTrend();
        expect(t?.getAttribute('data-kpi-trend-direction')).toBe('up');
        expect(t?.getAttribute('data-kpi-trend-semantic')).toBe('good');
        expect(t?.textContent).toContain('▲');
        expect(t?.textContent).toContain('+2.4pp');
    });

    it('negative delta + up-good polarity → semantic=bad direction=down', () => {
        render(
            <KpiCard
                label="Coverage"
                value={75.3}
                format="percent"
                delta={-3.1}
                trendPolarity="up-good"
            />,
        );
        const t = getTrend();
        expect(t?.getAttribute('data-kpi-trend-direction')).toBe('down');
        expect(t?.getAttribute('data-kpi-trend-semantic')).toBe('bad');
        expect(t?.textContent).toContain('▼');
        expect(t?.textContent).toContain('−3.1pp');
    });

    it('negative delta + down-good polarity → semantic=good (improvement)', () => {
        render(
            <KpiCard
                label="Overdue evidence"
                value={5}
                format="number"
                delta={-7}
                trendPolarity="down-good"
            />,
        );
        const t = getTrend();
        expect(t?.getAttribute('data-kpi-trend-direction')).toBe('down');
        expect(t?.getAttribute('data-kpi-trend-semantic')).toBe('good');
    });

    it('positive delta + down-good polarity → semantic=bad (regression)', () => {
        render(
            <KpiCard
                label="Critical risks"
                value={4}
                format="number"
                delta={3}
                trendPolarity="down-good"
            />,
        );
        const t = getTrend();
        expect(t?.getAttribute('data-kpi-trend-semantic')).toBe('bad');
    });

    it('any delta + neutral polarity → semantic=neutral', () => {
        render(
            <KpiCard
                label="Tenants"
                value={12}
                format="number"
                delta={4}
                trendPolarity="neutral"
            />,
        );
        const t = getTrend();
        expect(t?.getAttribute('data-kpi-trend-semantic')).toBe('neutral');
    });

    // ─── Auto-compute path ─────────────────────────────────────────

    it('auto-computes percent from previousValue + value', () => {
        render(
            <KpiCard
                label="Coverage"
                value={80}
                format="percent"
                previousValue={60}
                trendPolarity="up-good"
            />,
        );
        const t = getTrend();
        // (80 - 60) / 60 * 100 = 33.333%, formatted with one decimal
        expect(t?.textContent).toContain('+33.3%');
        expect(t?.getAttribute('data-kpi-trend-direction')).toBe('up');
        expect(t?.getAttribute('data-kpi-trend-semantic')).toBe('good');
    });

    it('auto-compute hides indicator when previousValue is null', () => {
        render(
            <KpiCard
                label="Coverage"
                value={80}
                format="percent"
                previousValue={null}
            />,
        );
        expect(getTrend()).toBeNull();
    });

    it('auto-compute hides indicator on baseline=0 + current>0 (no fake %)', () => {
        // % change is mathematically undefined — the helper returns
        // `unavailable: baseline_zero` and the card omits the
        // indicator rather than surfacing "+Infinity%".
        render(
            <KpiCard
                label="Coverage"
                value={5}
                format="number"
                previousValue={0}
            />,
        );
        expect(getTrend()).toBeNull();
    });

    it('auto-compute renders flat indicator when current === previous', () => {
        render(
            <KpiCard
                label="Coverage"
                value={42}
                format="number"
                previousValue={42}
                trendPolarity="up-good"
            />,
        );
        const t = getTrend();
        expect(t?.getAttribute('data-kpi-trend-direction')).toBe('flat');
        expect(t?.getAttribute('data-kpi-trend-semantic')).toBe('neutral');
        expect(t?.textContent).toContain('—');
    });

    // ─── Hidden ────────────────────────────────────────────────────

    it('hides indicator when neither delta nor previousValue is set', () => {
        render(<KpiCard label="Coverage" value={75} format="percent" />);
        expect(getTrend()).toBeNull();
    });

    // ─── Precedence ────────────────────────────────────────────────

    it('explicit delta wins over previousValue when both are passed', () => {
        // previousValue would compute +33.3%; delta says +1.0pp.
        // The explicit delta path wins — caller's math trumps.
        render(
            <KpiCard
                label="Coverage"
                value={80}
                format="percent"
                previousValue={60}
                delta={1.0}
                trendPolarity="up-good"
            />,
        );
        const t = getTrend();
        expect(t?.textContent).toContain('+1.0pp');
        expect(t?.textContent).not.toContain('+33.3%');
    });
});
