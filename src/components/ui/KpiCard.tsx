/**
 * KpiCard — Reusable executive KPI stat card.
 *
 * Renders a headline numeric value with label, optional subtitle,
 * optional delta/trend indicator, optional icon, and optional
 * inline sparkline (Epic 59 `MiniAreaChart`) so an exec can read
 * both the current number and the 30-day direction at a glance.
 *
 * Design language:
 *   - glass-card container with hover lift
 *   - gradient text for the headline value
 *   - Inter font (inherited from globals)
 *   - Dark theme compatible (slate-400/500 for secondary text)
 *
 * @example
 * ```tsx
 * <KpiCard
 *     label="Control Coverage"
 *     value={75.3}
 *     format="percent"
 *     icon={ShieldCheck}
 *     gradient="from-emerald-500 to-teal-500"
 *     subtitle="15 of 20 implemented"
 *     trend={[{ date, value }, ...]}
 *     trendVariant="success"
 * />
 * ```
 */
import { type LucideIcon } from 'lucide-react';

import { MiniAreaChart, type MiniAreaChartVariant } from '@/components/ui/mini-area-chart';
import { computeKpiTrend, formatTrendAbsolute, formatTrendPercent, trendDirectionIcon, type TrendPolarity } from '@/lib/kpi-trend';

// ─── Props ──────────────────────────────────────────────────────────

export type KpiFormat = 'number' | 'percent' | 'compact';

export interface KpiCardProps {
    /** Card label (top-left, small caps) */
    label: string;
    /** Headline value */
    value: number | null | undefined;
    /** How to format the value */
    format?: KpiFormat;
    /** Optional Lucide icon */
    icon?: LucideIcon;
    /** Tailwind gradient classes for headline text, e.g. "from-blue-500 to-cyan-500" */
    gradient?: string;
    /** Secondary text below the value */
    subtitle?: string;
    /**
     * Delta from previous period — shows as ▲/▼ with color.
     *
     * Two ways to drive the trend indicator:
     *   1. **Pre-computed** — pass `delta` (caller owns the math).
     *      Polarity flag still applies for colour. Right path when
     *      "vs what" isn't a simple subtraction (running averages,
     *      weighted scores, multi-period composite metrics).
     *   2. **Auto-compute** — pass `previousValue` and let the card
     *      compute delta + percent. Edge cases (null, zero baseline,
     *      negative baseline) are handled by `computeKpiTrend`.
     *
     * If both are passed, `delta` wins (explicit > derived).
     */
    delta?: number | null;
    /** What the delta represents (e.g. "vs last quarter"). */
    deltaLabel?: string;
    /**
     * Previous-period value for auto-computed trend. Null = baseline
     * missing → indicator hidden. See `computeKpiTrend` for the full
     * edge-case matrix (zero baseline, negative baseline).
     */
    previousValue?: number | null;
    /**
     * Polarity of the metric for good/bad colouring.
     *   - `up-good`   — positive delta is GREEN (default; matches
     *                   the prior behaviour for back-compat).
     *   - `down-good` — negative delta is GREEN (overdue evidence,
     *                   critical risks, open incidents).
     *   - `neutral`   — colour always subtle (tenant count, total
     *                   controls — direction has no semantic).
     *
     * Picking the wrong polarity displays "growth in critical
     * risks" as a green arrow, which is actively harmful — hence
     * why this is per-widget config, not a global default.
     */
    trendPolarity?: TrendPolarity;
    /** Optional CSS class on the outer container */
    className?: string;
    /** Optional test-id */
    id?: string;
    /** Optional sparkline data — ordered oldest→newest. Renders below the value row when provided. */
    trend?: ReadonlyArray<{ date: Date; value: number }>;
    /** Token-backed variant for the sparkline. Defaults to "brand". */
    trendVariant?: MiniAreaChartVariant;
    /** Override the sparkline's accessible label. Defaults to `${label} 30-day trend`. */
    trendAriaLabel?: string;
}

// ─── Formatters ─────────────────────────────────────────────────────

function formatValue(value: number | null | undefined, format: KpiFormat): string {
    if (value === null || value === undefined) return '—';
    switch (format) {
        case 'percent':
            return `${value.toFixed(1)}%`;
        case 'compact':
            if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
            if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
            return value.toLocaleString();
        case 'number':
        default:
            return value.toLocaleString();
    }
}

// ─── Trend resolver ─────────────────────────────────────────────────
//
// Token-backed colour bag per semantic. Tailwind's `text-*` classes
// pull from CSS variables (Epic 51 token system); the shared theme
// flips light/dark in lockstep.

const SEMANTIC_TEXT_TOKEN = {
    good: 'text-emerald-400',
    bad: 'text-red-400',
    neutral: 'text-content-subtle',
} as const;

interface TrendIndicator {
    direction: 'up' | 'down' | 'flat';
    semantic: 'good' | 'bad' | 'neutral';
    icon: string;
    text: string;
}

function resolveTrendIndicator(input: {
    value: number | null;
    delta: number | null;
    previousValue: number | null;
    format: KpiFormat;
    polarity: TrendPolarity;
}): TrendIndicator | null {
    // Path 1 — explicit delta. Caller has done the math; we only
    // colour + format. Polarity still applies.
    if (input.delta !== null) {
        const direction: 'up' | 'down' | 'flat' =
            input.delta > 0 ? 'up' : input.delta < 0 ? 'down' : 'flat';
        const semantic: 'good' | 'bad' | 'neutral' =
            direction === 'flat' || input.polarity === 'neutral'
                ? 'neutral'
                : (input.polarity === 'up-good' && direction === 'up') ||
                    (input.polarity === 'down-good' && direction === 'down')
                  ? 'good'
                  : 'bad';
        return {
            direction,
            semantic,
            icon: trendDirectionIcon(direction),
            text: formatTrendAbsolute(input.delta, input.format),
        };
    }

    // Path 2 — auto-compute. All edge cases live in the helper.
    if (input.previousValue === null) return null;
    const trend = computeKpiTrend({
        current: input.value,
        previous: input.previousValue,
        polarity: input.polarity,
    });
    if (trend.kind === 'unavailable') return null;
    if (trend.kind === 'flat') {
        return {
            direction: 'flat',
            semantic: 'neutral',
            icon: trendDirectionIcon('flat'),
            text: formatTrendPercent(0),
        };
    }
    return {
        direction: trend.direction,
        semantic: trend.semantic,
        icon: trendDirectionIcon(trend.direction),
        text: formatTrendPercent(trend.deltaPercent),
    };
}

// ─── Component ──────────────────────────────────────────────────────

export default function KpiCard({
    label,
    value,
    format = 'number',
    icon: Icon,
    gradient = 'from-[var(--brand-default)] to-[var(--brand-muted)]',
    subtitle,
    delta,
    deltaLabel,
    previousValue,
    trendPolarity = 'up-good',
    className = '',
    id,
    trend,
    trendVariant = 'brand',
    trendAriaLabel,
}: KpiCardProps) {
    const formatted = formatValue(value, format);
    const isEmpty = value === null || value === undefined;
    const indicator = resolveTrendIndicator({
        value: value ?? null,
        delta: delta ?? null,
        previousValue: previousValue ?? null,
        format,
        polarity: trendPolarity,
    });

    return (
        <div
            id={id}
            className={`glass-card p-4 hover:scale-[1.02] transition-transform ${className}`}
        >
            {/* Header: icon + label */}
            <div className="flex items-center gap-2 mb-2">
                {Icon && <Icon className="w-4 h-4 text-content-muted" aria-hidden="true" />}
                <span className="text-xs text-content-muted uppercase tracking-wide font-medium">
                    {label}
                </span>
            </div>

            {/* Headline value */}
            <p
                className={`text-2xl font-bold ${
                    isEmpty
                        ? 'text-content-subtle'
                        : `bg-gradient-to-r ${gradient} bg-clip-text text-transparent`
                }`}
            >
                {formatted}
            </p>

            {/* Trend indicator (delta direction + magnitude + optional label) */}
            {indicator && (
                <div className="flex items-center gap-1 mt-1" data-kpi-trend-row>
                    <span
                        className={`text-xs font-medium ${SEMANTIC_TEXT_TOKEN[indicator.semantic]}`}
                        data-kpi-trend-direction={indicator.direction}
                        data-kpi-trend-semantic={indicator.semantic}
                    >
                        {indicator.icon}
                        {' '}
                        {indicator.text}
                    </span>
                    {deltaLabel && (
                        <span className="text-xs text-content-subtle">{deltaLabel}</span>
                    )}
                </div>
            )}

            {/* Subtitle */}
            {subtitle && (
                <p className="text-xs text-content-subtle mt-1">{subtitle}</p>
            )}

            {/* Sparkline */}
            {trend && trend.length > 0 && (
                <div className="mt-2 h-8 w-full" data-kpi-trend>
                    <MiniAreaChart
                        data={trend}
                        variant={trendVariant}
                        aria-label={trendAriaLabel ?? `${label} 30-day trend`}
                    />
                </div>
            )}
        </div>
    );
}
