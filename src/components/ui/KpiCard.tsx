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
    /** Delta from previous period — shows as ▲/▼ with color */
    delta?: number | null;
    /** What the delta represents */
    deltaLabel?: string;
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
    className = '',
    id,
    trend,
    trendVariant = 'brand',
    trendAriaLabel,
}: KpiCardProps) {
    const formatted = formatValue(value, format);
    const isEmpty = value === null || value === undefined;

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

            {/* Delta indicator */}
            {delta !== null && delta !== undefined && (
                <div className="flex items-center gap-1 mt-1">
                    <span
                        className={`text-xs font-medium ${
                            delta > 0
                                ? 'text-emerald-400'
                                : delta < 0
                                  ? 'text-red-400'
                                  : 'text-content-subtle'
                        }`}
                    >
                        {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'}
                        {' '}
                        {Math.abs(delta).toFixed(1)}
                        {format === 'percent' ? 'pp' : ''}
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
