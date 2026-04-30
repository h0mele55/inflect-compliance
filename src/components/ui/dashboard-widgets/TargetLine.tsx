"use client";

/**
 * Epic 41 — `<TargetLine>` chart overlay.
 *
 * A dashed reference line at a specified y-value on a
 * `<TimeSeriesChart>`. Renders inside the chart's SVG via the
 * existing chart context (`useChartContext`), so it picks up the
 * current `yScale` and dimensions automatically and re-projects
 * when the chart resizes.
 *
 * Why a separate component (vs inlining in ChartRenderer):
 *
 *   - It needs `useChartContext()`, which throws when called
 *     outside a `<TimeSeriesChart>`. Encapsulating that contract
 *     in a dedicated component keeps the renderer's switch arm
 *     focused on dispatch.
 *   - Future consumers (per-tenant charts, SLA dashboards) can
 *     drop `<TargetLine value={…} />` straight into any
 *     TimeSeriesChart child slot.
 *
 * Visual choices:
 *
 *   - Line uses `currentColor` on a `text-content-subtle` parent
 *     so it inherits the chart-platform's neutral overlay tone.
 *     `strokeDasharray="4 4"` is the canonical "soft reference"
 *     look — visually present but not noisy enough to fight with
 *     the data series.
 *   - Label is rendered as a small badge anchored to the right
 *     edge of the plot. `text-anchor="end"` keeps it readable
 *     even on a tight chart width.
 *   - When `value` falls outside the chart's `[minY, maxY]`
 *     domain, the projection still renders, but visibly off the
 *     plot — the chart's clipPath is the proper limiter (the
 *     caller's responsibility to set if they want hard clipping).
 */

import { useChartContext } from '@/components/ui/charts';
import type { ChartTargetConfig } from './types';

export interface TargetLineProps extends ChartTargetConfig {}

export function TargetLine({ value, label }: TargetLineProps) {
    const ctx = useChartContext();
    const y = ctx.yScale(value);
    const left = ctx.leftAxisMargin ?? 0;
    const right = ctx.width;

    return (
        <g
            data-target-line
            data-target-value={value}
            className="text-content-subtle pointer-events-none"
        >
            <line
                x1={left}
                x2={right}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray="4 4"
                strokeOpacity={0.7}
            />
            {label && (
                <g transform={`translate(${right - 6}, ${y - 6})`}>
                    {/* Soft background pill so the label stays
                     *  readable when crossing the data series. */}
                    <rect
                        x={-Math.max(label.length * 6, 24)}
                        y={-9}
                        width={Math.max(label.length * 6 + 8, 32)}
                        height={14}
                        rx={3}
                        ry={3}
                        className="fill-bg-default"
                        fillOpacity={0.85}
                    />
                    <text
                        textAnchor="end"
                        fontSize={10}
                        className="fill-content-muted"
                    >
                        {label}
                    </text>
                </g>
            )}
        </g>
    );
}
