/**
 * Epic 41 — TargetLine on time-series charts (rendered).
 *
 * jsdom's `<ParentSize>` reports 0×0, so the chart-platform's
 * `<TimeSeriesChart>` short-circuits to its empty-state placeholder
 * for any `data` length. To exercise the TargetLine SVG path we
 * mock the chart-platform's `useChartContext` to return a fixed
 * scale + dimensions, then render `<TargetLine>` directly.
 *
 * Coverage:
 *   - target line renders an SVG line at the y-projected value
 *   - target label renders when supplied
 *   - target label is omitted when not supplied
 *   - data-target-value is set so DOM tools can find the right line
 */

import { render } from '@testing-library/react';
import * as React from 'react';

jest.mock('@/components/ui/charts', () => ({
    __esModule: true,
    useChartContext: () => ({
        // y=0 → 200, y=100 → 0 (typical inverted screen-space axis)
        yScale: (v: number) => 200 - v * 2,
        width: 400,
        height: 200,
        leftAxisMargin: 40,
    }),
}));

import { TargetLine } from '@/components/ui/dashboard-widgets/TargetLine';

function renderInSvg(node: React.ReactNode) {
    // TargetLine renders SVG nodes (<g>, <line>, <text>); wrap in
    // an <svg> so the DOM tree is well-formed for jsdom.
    return render(<svg>{node}</svg>);
}

describe('Epic 41 — TargetLine', () => {
    it('renders a dashed line at the projected y for the target value', () => {
        renderInSvg(<TargetLine value={50} />);
        const root = document.querySelector('[data-target-line]');
        expect(root).not.toBeNull();
        expect(root?.getAttribute('data-target-value')).toBe('50');

        const line = root?.querySelector('line');
        expect(line).not.toBeNull();
        // y-projection: 200 - 50*2 = 100
        expect(line?.getAttribute('y1')).toBe('100');
        expect(line?.getAttribute('y2')).toBe('100');
        // Spans from leftAxisMargin (40) to width (400)
        expect(line?.getAttribute('x1')).toBe('40');
        expect(line?.getAttribute('x2')).toBe('400');
        expect(line?.getAttribute('stroke-dasharray')).toBe('4 4');
    });

    it('renders the label when supplied', () => {
        renderInSvg(<TargetLine value={80} label="SLA: 80%" />);
        const text = document.querySelector('[data-target-line] text');
        expect(text?.textContent).toBe('SLA: 80%');
    });

    it('omits the label element when no label is supplied', () => {
        renderInSvg(<TargetLine value={80} />);
        const text = document.querySelector('[data-target-line] text');
        expect(text).toBeNull();
    });

    it('preserves arbitrary numeric values in data-target-value', () => {
        renderInSvg(<TargetLine value={42.5} label="custom" />);
        const root = document.querySelector('[data-target-line]');
        expect(root?.getAttribute('data-target-value')).toBe('42.5');
    });
});
