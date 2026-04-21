/**
 * TrendCard — Epic 59 dashboard integration.
 *
 * Covers:
 *   - Header row (label + value + optional suffix)
 *   - Sparkline renders with the expected role/aria label
 *   - Empty series falls through to the token-backed baseline rather
 *     than a silent zero-height block
 *   - Token-backed colour class reaches the rendered area so the
 *     dashboard semantic (success/warning/error/info) is visible
 */

import React from 'react';
import { render } from '@testing-library/react';

// jsdom reports 0×0 for unsized elements, which ParentSize treats as
// "skip render". Stub it so the chart has room to draw under test.
jest.mock('@visx/responsive', () => {
    const actual = jest.requireActual('@visx/responsive');
    return {
        ...actual,
        ParentSize: ({
            children,
            className,
        }: {
            children: (args: { width: number; height: number }) => React.ReactNode;
            className?: string;
        }) => (
            <div
                data-testid="trend-card-parent-size"
                className={className}
                style={{ width: 200, height: 48 }}>
                {children({ width: 200, height: 48 })}
            </div>
        ),
    };
});

import { TrendCard } from '@/components/ui/TrendCard';

// ─── Fixtures ────────────────────────────────────────────────────────

function makePoints(values: number[], start = new Date('2026-04-01T00:00:00Z')) {
    return values.map((value, i) => ({
        date: new Date(start.getTime() + i * 24 * 60 * 60 * 1000),
        value,
    }));
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('TrendCard', () => {
    it('renders the label, the current value, and the format suffix', () => {
        const { getByText } = render(
            <TrendCard
                label="Coverage"
                value={75}
                format="%"
                points={makePoints([70, 72, 74, 75])}
                colorClassName="text-emerald-500"
            />,
        );
        expect(getByText('Coverage')).toBeInTheDocument();
        expect(getByText(/75%/)).toBeInTheDocument();
    });

    it('omits the format suffix when none is provided', () => {
        const { getByText, queryByText } = render(
            <TrendCard
                label="Open Risks"
                value={12}
                points={makePoints([10, 11, 12])}
                colorClassName="text-amber-500"
            />,
        );
        expect(getByText('12')).toBeInTheDocument();
        expect(queryByText(/12%/)).toBeNull();
    });

    it('renders an accessible sparkline with an aria label derived from the label', () => {
        const { getByLabelText } = render(
            <TrendCard
                label="Open Findings"
                value={3}
                points={makePoints([5, 4, 3])}
                colorClassName="text-purple-500"
            />,
        );
        expect(getByLabelText('Open Findings trend')).toBeInTheDocument();
    });

    it('renders the chart SVG inside the card container', () => {
        const { container } = render(
            <TrendCard
                label="Overdue Evidence"
                value={2}
                points={makePoints([4, 3, 2])}
                colorClassName="text-red-500"
            />,
        );
        expect(container.querySelector('[data-trend-card]')).not.toBeNull();
        expect(container.querySelector('[data-chart="time-series"]')).not.toBeNull();
    });

    it('falls back to the token-backed baseline when points is empty', () => {
        const { container, getByText } = render(
            <TrendCard
                label="Coverage"
                value={0}
                format="%"
                points={[]}
                colorClassName="text-emerald-500"
            />,
        );
        // Header still renders even with no trend data
        expect(getByText('Coverage')).toBeInTheDocument();
        expect(getByText(/0%/)).toBeInTheDocument();
        // Empty-state baseline renders instead of the chart SVG
        expect(container.querySelector('[data-trend-empty]')).not.toBeNull();
        expect(container.querySelector('[data-chart="time-series"]')).toBeNull();
    });

    it('survives a single-point series (not enough to draw a line)', () => {
        const { container, getByText } = render(
            <TrendCard
                label="Coverage"
                value={75}
                format="%"
                points={makePoints([75])}
                colorClassName="text-emerald-500"
            />,
        );
        expect(getByText('Coverage')).toBeInTheDocument();
        // Chart renders (non-empty data), even if visually degenerate
        expect(container.querySelector('[data-chart="time-series"]')).not.toBeNull();
    });

    it('passes the caller-supplied colorClassName down to the area fill', () => {
        const { container } = render(
            <TrendCard
                label="Coverage"
                value={75}
                format="%"
                points={makePoints([70, 72, 74, 75])}
                colorClassName="text-emerald-500"
            />,
        );
        // The Areas primitive renders a motion.path with the series
        // colorClassName merged onto it via cn().
        const coloredNode = container.querySelector('.text-emerald-500');
        expect(coloredNode).not.toBeNull();
    });
});
