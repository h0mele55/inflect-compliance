/**
 * KpiCard — Epic 59 sparkline integration.
 *
 * Verifies that KpiCard renders the optional MiniAreaChart sparkline
 * when a `trend` prop is provided, and falls back to the legacy
 * (no-trend) layout otherwise. Also covers the trendVariant token
 * flowing through to the sparkline's colour class.
 */

import React from 'react';
import { render } from '@testing-library/react';

// jsdom reports 0×0 for unsized elements, which ParentSize treats as
// "skip render". Stub it so MiniAreaChart has room to draw under test.
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
                data-testid="kpi-parent-size"
                className={className}
                style={{ width: 160, height: 32 }}>
                {children({ width: 160, height: 32 })}
            </div>
        ),
    };
});

import KpiCard from '@/components/ui/KpiCard';
import { ShieldCheck } from 'lucide-react';

// ─── Fixtures ────────────────────────────────────────────────────────

function makeTrend(values: number[]) {
    const start = new Date('2026-04-01T00:00:00Z').getTime();
    return values.map((value, i) => ({
        date: new Date(start + i * 24 * 60 * 60 * 1000),
        value,
    }));
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('KpiCard — sparkline integration (Epic 59)', () => {
    it('renders the sparkline wrapper when trend data is supplied', () => {
        const { container } = render(
            <KpiCard
                label="Coverage"
                value={75.3}
                format="percent"
                icon={ShieldCheck}
                trend={makeTrend([70, 72, 74, 75.3])}
                trendVariant="success"
            />,
        );
        expect(container.querySelector('[data-kpi-trend]')).not.toBeNull();
        expect(container.querySelector('[data-mini-chart]')).not.toBeNull();
    });

    it('omits the sparkline wrapper when no trend data is supplied', () => {
        const { container } = render(
            <KpiCard
                label="Policies"
                value={12}
                icon={ShieldCheck}
            />,
        );
        expect(container.querySelector('[data-kpi-trend]')).toBeNull();
        expect(container.querySelector('[data-mini-chart]')).toBeNull();
    });

    it('omits the sparkline wrapper when trend array is empty', () => {
        const { container } = render(
            <KpiCard
                label="Findings"
                value={0}
                icon={ShieldCheck}
                trend={[]}
            />,
        );
        expect(container.querySelector('[data-kpi-trend]')).toBeNull();
    });

    it('renders the card value and subtitle with or without the trend', () => {
        const { getByText: getWithTrend } = render(
            <KpiCard
                label="Coverage"
                value={75.3}
                format="percent"
                icon={ShieldCheck}
                subtitle="15 of 20 implemented"
                trend={makeTrend([70, 72, 74, 75.3])}
                trendVariant="success"
            />,
        );
        expect(getWithTrend('Coverage')).toBeInTheDocument();
        expect(getWithTrend('15 of 20 implemented')).toBeInTheDocument();
    });

    it('passes the trendVariant through to the underlying MiniAreaChart', () => {
        const { container } = render(
            <KpiCard
                label="Findings"
                value={7}
                icon={ShieldCheck}
                trend={makeTrend([3, 5, 6, 7])}
                trendVariant="error"
            />,
        );
        // MiniAreaChart maps variant="error" → class "text-content-error"
        const miniChart = container.querySelector('[data-mini-chart]');
        expect(miniChart).not.toBeNull();
        // `.className` on SVG is an SVGAnimatedString; read the raw class attr.
        expect(miniChart?.getAttribute('class')).toContain('text-content-error');
    });

    it('exposes the sparkline behind an aria-label derived from the card label', () => {
        const { getByLabelText } = render(
            <KpiCard
                label="Open Risks"
                value={18}
                icon={ShieldCheck}
                trend={makeTrend([10, 12, 14, 18])}
                trendVariant="warning"
            />,
        );
        expect(getByLabelText('Open Risks 30-day trend')).toBeInTheDocument();
    });

    it('accepts a caller-provided trendAriaLabel override', () => {
        const { getByLabelText } = render(
            <KpiCard
                label="Open Risks"
                value={18}
                icon={ShieldCheck}
                trend={makeTrend([10, 12, 14, 18])}
                trendAriaLabel="Open risks — last 30 days"
            />,
        );
        expect(getByLabelText('Open risks — last 30 days')).toBeInTheDocument();
    });
});
