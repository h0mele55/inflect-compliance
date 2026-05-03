/**
 * AnimatedNumber — Epic 61 shared primitive for animated numeric
 * transitions across KPI cards, stat rows, progress cards, trend
 * cards, and portfolio metrics.
 *
 * Wraps `@number-flow/react` behind a stable, library-agnostic API
 * so callers don't import NumberFlow directly. The wrapper owns:
 *
 *   - Format presets (integer / decimal / percent / currency) plus
 *     a passthrough for arbitrary `Intl.NumberFormatOptions`.
 *   - Trend semantics surfaced as `data-trend` (consumers colour
 *     via CSS / tokens; the primitive stays token-agnostic).
 *   - A non-animating fallback (`animate={false}`) that renders the
 *     formatted value as plain text — same DOM shape, same
 *     accessible name. NumberFlow itself respects
 *     `prefers-reduced-motion` internally.
 *   - A11y: `aria-label` defaults to the resolved formatted string
 *     so screen readers announce a single coherent value rather
 *     than the per-digit visual structure.
 *
 * Percent convention: `{ kind: 'percent' }` expects the value
 * pre-multiplied (e.g. `75.3` → `"75.3%"`), matching every other
 * percent rendering in this codebase. We don't use Intl's
 * `style: 'percent'` (which divides by 100) to avoid contradicting
 * the existing convention.
 */
'use client';

import * as React from 'react';
import NumberFlow, { type Format } from '@number-flow/react';

// ─── Format presets ─────────────────────────────────────────────────

/**
 * Discriminated union covering the four common dashboard formats
 * plus an escape hatch for arbitrary `Intl.NumberFormatOptions`.
 *
 * Always pass `kind` so the type stays exhaustive — never widen to
 * `string` shorthands. Adding a new preset means adding a new
 * `kind` branch here AND a switch arm in `resolveFormat`.
 */
export type AnimatedNumberFormat =
    | { kind: 'integer' }
    | { kind: 'decimal'; fractionDigits?: number }
    | { kind: 'percent'; fractionDigits?: number }
    | { kind: 'currency'; currency: string; fractionDigits?: number }
    | { kind: 'intl'; options: Intl.NumberFormatOptions };

/** Trend semantic. Consumers colour via `[data-trend="..."]` selectors. */
export type AnimatedNumberTrend = 'up' | 'down' | 'neutral';

interface ResolvedFormat {
    /** `Intl.NumberFormatOptions` to feed both NumberFlow and the static fallback. */
    intl: Intl.NumberFormatOptions;
    /** Suffix appended after the formatted number (e.g. "%"). */
    suffix: string;
}

function resolveFormat(format: AnimatedNumberFormat): ResolvedFormat {
    switch (format.kind) {
        case 'integer':
            return {
                intl: { maximumFractionDigits: 0 },
                suffix: '',
            };
        case 'decimal': {
            const digits = format.fractionDigits ?? 1;
            return {
                intl: {
                    minimumFractionDigits: digits,
                    maximumFractionDigits: digits,
                },
                suffix: '',
            };
        }
        case 'percent': {
            const digits = format.fractionDigits ?? 1;
            return {
                intl: {
                    minimumFractionDigits: digits,
                    maximumFractionDigits: digits,
                },
                suffix: '%',
            };
        }
        case 'currency': {
            const digits = format.fractionDigits ?? 2;
            return {
                intl: {
                    style: 'currency',
                    currency: format.currency,
                    minimumFractionDigits: digits,
                    maximumFractionDigits: digits,
                },
                suffix: '',
            };
        }
        case 'intl':
            return { intl: format.options, suffix: '' };
    }
}

// ─── Props ──────────────────────────────────────────────────────────

export interface AnimatedNumberProps {
    /** Target value to animate to (or render statically when `animate={false}`). */
    value: number;
    /** Format preset or Intl options. Defaults to `{ kind: 'integer' }`. */
    format?: AnimatedNumberFormat;
    /** BCP-47 locale tag(s). Defaults to the runtime/browser default. */
    locale?: Intl.LocalesArgument;
    /**
     * Optional semantic hint surfaced as `data-trend`. The primitive
     * stays token-agnostic — consumers select on the data attribute
     * (e.g. KpiCard's existing semantic-token bag) to apply colour.
     */
    trend?: AnimatedNumberTrend;
    /**
     * Disable animation. NumberFlow already honours
     * `prefers-reduced-motion`; this flag is for cases where the
     * caller wants a static render unconditionally (snapshot tests,
     * print/PDF surfaces, etc.).
     */
    animate?: boolean;
    /** Optional class on the wrapper `<span>`. */
    className?: string;
    /** Optional id on the wrapper `<span>`. */
    id?: string;
    /** Optional prefix prepended in front of the number (e.g. "≈"). */
    prefix?: string;
    /**
     * Optional suffix appended after the number. Concatenated with
     * the format's own suffix (e.g. percent's `%`), so a caller can
     * say `suffix=" / yr"` on a percent without losing the `%`.
     */
    suffix?: string;
    /**
     * Override the announced accessible name. Defaults to the
     * locale-formatted value (with prefix + suffix). Override only
     * when surrounding context already names the metric and a bare
     * number sounds less confusing.
     */
    'aria-label'?: string;
}

// ─── Component ──────────────────────────────────────────────────────

export function AnimatedNumber({
    value,
    format = { kind: 'integer' },
    locale,
    trend,
    animate = true,
    className,
    id,
    prefix,
    suffix,
    'aria-label': ariaLabel,
}: AnimatedNumberProps) {
    const { intl, suffix: presetSuffix } = resolveFormat(format);
    const composedSuffix = `${presetSuffix}${suffix ?? ''}`;
    const formatted = React.useMemo(() => {
        const body = new Intl.NumberFormat(locale, intl).format(value);
        return `${prefix ?? ''}${body}${composedSuffix}`;
        // The Intl options object is rebuilt every render but its
        // shape is content-equivalent across renders for the same
        // `format`; the deps below cover the same surface.
    }, [value, locale, prefix, composedSuffix, intl]);

    const a11yLabel = ariaLabel ?? formatted;

    if (!animate) {
        return (
            <span
                id={id}
                className={className}
                data-trend={trend}
                data-animated-number="static"
                aria-label={a11yLabel}
            >
                {formatted}
            </span>
        );
    }

    return (
        <span
            id={id}
            className={className}
            data-trend={trend}
            data-animated-number="animated"
            aria-label={a11yLabel}
        >
            <NumberFlow
                value={value}
                locales={locale}
                // NumberFlow's `Format` is a narrower subset of
                // `Intl.NumberFormatOptions` (no scientific /
                // engineering notation, etc.). Our preset resolver
                // never produces those, and the `intl` passthrough
                // preset's caller is already typed against
                // `Intl.NumberFormatOptions` — so the runtime is
                // safe; we just narrow the type for the library.
                format={intl as Format}
                prefix={prefix}
                suffix={composedSuffix}
            />
        </span>
    );
}

export default AnimatedNumber;
