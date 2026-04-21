/**
 * Epic 59 — canonical TimeSeriesChart rendered behaviour.
 *
 * Scope:
 *   - Area + bar rendering through the shared platform (data-chart
 *     marker on the SVG, correct data-chart-type, axes + primitives
 *     mount, token-backed colour defaults).
 *   - Hover tooltip interaction — mousemove on the capture region
 *     surfaces the tooltip container with the caller's
 *     `tooltipContent`.
 *   - No-data / empty-series states render the canonical empty
 *     state (default or caller-supplied) instead of a silent gap.
 *   - Responsive rendering behaves sanely at 0x0 (renders nothing)
 *     and at real dimensions (full chart tree).
 *   - Multi-series rendering — two active series both paint, the
 *     `Series.colorClassName` override wins over the default.
 *
 * `@visx/responsive`'s `ParentSize` is mocked to call its render
 * prop with fixed dimensions so the tests exercise the real inner
 * component path without fighting jsdom's zero-sized layout.
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';

// Mock ParentSize → render at a known size. jsdom reports
// 0x0 for every element by default, which the normal ParentSize
// path interprets as "don't render", defeating the tests.
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
                data-testid="parent-size"
                className={className}
                style={{ width: 640, height: 320 }}>
                {children({ width: 640, height: 320 })}
            </div>
        ),
    };
});

import { Areas, Bars, TimeSeriesChart, XAxis, YAxis } from '@/components/ui/charts';
import type { Data, Series } from '@/components/ui/charts';

interface DemoValues {
    coverage: number;
    issues?: number;
}

const sevenDayData: Data<DemoValues> = [
    { date: new Date('2026-04-01T00:00:00Z'), values: { coverage: 70 } },
    { date: new Date('2026-04-02T00:00:00Z'), values: { coverage: 72 } },
    { date: new Date('2026-04-03T00:00:00Z'), values: { coverage: 74 } },
    { date: new Date('2026-04-04T00:00:00Z'), values: { coverage: 76 } },
    { date: new Date('2026-04-05T00:00:00Z'), values: { coverage: 78 } },
    { date: new Date('2026-04-06T00:00:00Z'), values: { coverage: 80 } },
    { date: new Date('2026-04-07T00:00:00Z'), values: { coverage: 82 } },
];

const singleSeries: Series<DemoValues>[] = [
    {
        id: 'coverage',
        valueAccessor: (d) => d.values.coverage,
        isActive: true,
    },
];

const twoSeries: Series<DemoValues>[] = [
    {
        id: 'coverage',
        valueAccessor: (d) => d.values.coverage,
        isActive: true,
        colorClassName: 'text-brand-default',
    },
    {
        id: 'issues',
        valueAccessor: (d) => d.values.issues ?? 0,
        isActive: true,
        colorClassName: 'text-content-warning',
    },
];

// ─── Area rendering ───────────────────────────────────────────────────

describe('TimeSeriesChart — area mode', () => {
    it('renders an svg with data-chart + area type markers', () => {
        const { container } = render(
            <TimeSeriesChart data={sevenDayData} series={singleSeries}>
                <YAxis showGridLines />
                <Areas />
                <XAxis />
            </TimeSeriesChart>,
        );
        const svg = container.querySelector('svg[data-chart="time-series"]');
        expect(svg).not.toBeNull();
        expect(svg?.getAttribute('data-chart-type')).toBe('area');
    });

    it('mounts the children axis + area primitives into the shared context', () => {
        const { container } = render(
            <TimeSeriesChart data={sevenDayData} series={singleSeries}>
                <YAxis />
                <Areas />
                <XAxis />
            </TimeSeriesChart>,
        );
        // XAxis writes tick labels; YAxis writes tick labels; Areas writes
        // an SVG path per active series. Together they must produce at
        // least one <path> and several <text> nodes.
        expect(container.querySelectorAll('text').length).toBeGreaterThan(0);
        expect(container.querySelectorAll('path').length).toBeGreaterThan(0);
    });

    it('series without an explicit colorClassName fall back to text-brand-default', () => {
        const { container } = render(
            <TimeSeriesChart data={sevenDayData} series={singleSeries}>
                <Areas />
            </TimeSeriesChart>,
        );
        // At least one path carries a brand-token class.
        const paths = Array.from(container.querySelectorAll('path'));
        const classes = paths.flatMap((p) => (p.getAttribute('class') ?? '').split(/\s+/));
        expect(
            classes.some((c) => c === 'text-brand-default' || c === 'text-brand-emphasis'),
        ).toBe(true);
    });

    it('caller-supplied colorClassName wins over the brand default (multi-series)', () => {
        const data: Data<DemoValues> = sevenDayData.map((d, i) => ({
            ...d,
            values: { coverage: d.values.coverage, issues: i },
        }));
        const { container } = render(
            <TimeSeriesChart data={data} series={twoSeries}>
                <Areas />
            </TimeSeriesChart>,
        );
        const html = container.innerHTML;
        expect(html).toContain('text-brand-default');
        expect(html).toContain('text-content-warning');
    });
});

// ─── Bar rendering ────────────────────────────────────────────────────

describe('TimeSeriesChart — bar mode', () => {
    it('renders bars with the bar data-chart-type marker', () => {
        const { container } = render(
            <TimeSeriesChart
                type="bar"
                data={sevenDayData}
                series={singleSeries}>
                <YAxis />
                <Bars />
                <XAxis />
            </TimeSeriesChart>,
        );
        const svg = container.querySelector('svg[data-chart="time-series"]');
        expect(svg?.getAttribute('data-chart-type')).toBe('bar');
        // BarRounded emits <path> elements — one per active bar.
        expect(container.querySelectorAll('path').length).toBeGreaterThan(0);
    });
});

// ─── Tooltip interaction ─────────────────────────────────────────────

describe('TimeSeriesChart — hover tooltip', () => {
    it('renders the tooltip surface with caller tooltipContent after pointer move', async () => {
        const { container } = render(
            <TimeSeriesChart
                data={sevenDayData}
                series={singleSeries}
                tooltipContent={(d) => (
                    <span data-testid="tip">coverage {d.values.coverage}</span>
                )}>
                <YAxis />
                <Areas />
                <XAxis />
            </TimeSeriesChart>,
        );
        // Find the transparent hover-capture rect (the one inside the
        // inner Group that fills the plot area).
        const rects = Array.from(container.querySelectorAll('rect'));
        const capture = rects.find(
            (r) =>
                r.getAttribute('fill') === 'transparent' &&
                (r.getAttribute('width') ?? '0') !== '0',
        );
        expect(capture).toBeTruthy();

        fireEvent.mouseMove(capture!, { clientX: 100, clientY: 50 });

        // `useTooltip` schedules the state update via
        // `requestAnimationFrame` to batch mousemove spam. Wait for
        // the RAF to flush before asserting the surface mounted.
        await waitFor(() => {
            const tooltipSurface = container.querySelector('[data-chart-tooltip]');
            expect(tooltipSurface).not.toBeNull();
            expect(tooltipSurface?.textContent).toContain('coverage');
        });
    });

    it('hideTooltip runs on mouse-leave without crashing', () => {
        const { container } = render(
            <TimeSeriesChart data={sevenDayData} series={singleSeries}>
                <Areas />
            </TimeSeriesChart>,
        );
        const rects = Array.from(container.querySelectorAll('rect'));
        const capture = rects.find((r) => r.getAttribute('fill') === 'transparent');
        expect(capture).toBeTruthy();
        expect(() => fireEvent.mouseLeave(capture!)).not.toThrow();
    });
});

// ─── Empty / no-data states ──────────────────────────────────────────

describe('TimeSeriesChart — empty states', () => {
    it('renders the default empty copy when data is an empty array', () => {
        const { container, getByRole } = render(
            <TimeSeriesChart data={[]} series={singleSeries}>
                <Areas />
            </TimeSeriesChart>,
        );
        // The svg must NOT render.
        expect(container.querySelector('svg[data-chart="time-series"]')).toBeNull();
        // A status region with the default copy must.
        const status = getByRole('status');
        expect(status.textContent).toMatch(/no data/i);
        expect(status.getAttribute('data-chart-empty')).not.toBeNull();
    });

    it('renders the default empty copy when series is empty', () => {
        const { container, getByRole } = render(
            <TimeSeriesChart data={sevenDayData} series={[]}>
                <Areas />
            </TimeSeriesChart>,
        );
        expect(container.querySelector('svg[data-chart="time-series"]')).toBeNull();
        expect(getByRole('status').textContent).toMatch(/no data/i);
    });

    it('renders a caller-supplied emptyState node when provided', () => {
        const { queryByText, container } = render(
            <TimeSeriesChart
                data={[]}
                series={singleSeries}
                emptyState={
                    <div data-testid="custom-empty">Nothing to plot, sorry.</div>
                }>
                <Areas />
            </TimeSeriesChart>,
        );
        expect(queryByText('Nothing to plot, sorry.')).not.toBeNull();
        expect(container.querySelector('[data-chart-empty]')).toBeNull();
    });
});

// ─── Responsive sizing sanity ────────────────────────────────────────

describe('TimeSeriesChart — responsive rendering', () => {
    it('the mocked ParentSize wrapper carries the chart content at its fixed size', () => {
        const { getByTestId, container } = render(
            <TimeSeriesChart data={sevenDayData} series={singleSeries}>
                <Areas />
            </TimeSeriesChart>,
        );
        const wrapper = getByTestId('parent-size');
        expect(wrapper).not.toBeNull();
        // Chart svg is mounted inside the wrapper.
        expect(wrapper.querySelector('svg[data-chart="time-series"]')).not.toBeNull();
        // Outer svg width matches the measured width.
        const svg = container.querySelector('svg[data-chart="time-series"]');
        expect(svg?.getAttribute('width')).toBe('640');
        expect(svg?.getAttribute('height')).toBe('320');
    });

    it('renders nothing when ParentSize hands back 0×0 dimensions', () => {
        // Override the mocked ParentSize for this test via a wrapper.
        jest.isolateModules(() => {
            jest.resetModules();
            jest.doMock('@visx/responsive', () => {
                const actual = jest.requireActual('@visx/responsive');
                return {
                    ...actual,
                    ParentSize: ({
                        children,
                    }: {
                        children: (args: {
                            width: number;
                            height: number;
                        }) => React.ReactNode;
                    }) => <div>{children({ width: 0, height: 0 })}</div>,
                };
            });
            // Re-require the module so our override is applied.
            const mod = require('@/components/ui/charts') as typeof import('@/components/ui/charts');
            const { container } = render(
                <mod.TimeSeriesChart data={sevenDayData} series={singleSeries}>
                    <mod.Areas />
                </mod.TimeSeriesChart>,
            );
            expect(container.querySelector('svg[data-chart="time-series"]')).toBeNull();
        });
    });
});
