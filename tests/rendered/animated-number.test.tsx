/**
 * AnimatedNumber — Epic 61 primitive.
 *
 * Coverage:
 *   - format presets render the right accessible name and suffix
 *   - the static (non-animated) fallback emits the same formatted
 *     string as the animated path
 *   - the trend semantic surfaces as `data-trend`
 *   - re-rendering with the same value doesn't change the rendered
 *     output (NumberFlow handles transition internally; from the
 *     React side the rendered formatted string stays identical)
 *
 * NumberFlow renders a custom element that jsdom doesn't fully
 * understand. To keep the test deterministic we mock the library to
 * a passthrough span. The static path exercises the real
 * `Intl.NumberFormat` codepath, so format correctness is still
 * end-to-end verified via `animate={false}`.
 */
/** @jest-environment jsdom */

import React from 'react';
import { render } from '@testing-library/react';

jest.mock('@number-flow/react', () => {
    function MockNumberFlow({
        value,
        format,
        locales,
        prefix,
        suffix,
    }: {
        value: number;
        format?: Intl.NumberFormatOptions;
        locales?: Intl.LocalesArgument;
        prefix?: string;
        suffix?: string;
    }) {
        const body = new Intl.NumberFormat(locales, format).format(value);
        return (
            <span data-testid="number-flow">
                {prefix ?? ''}
                {body}
                {suffix ?? ''}
            </span>
        );
    }
    return { __esModule: true, default: MockNumberFlow };
});

import { AnimatedNumber } from '@/components/ui/animated-number';

describe('AnimatedNumber — format presets', () => {
    it('integer preset renders no fractional digits', () => {
        const { getByLabelText } = render(
            <AnimatedNumber value={1234} format={{ kind: 'integer' }} locale="en-US" />,
        );
        expect(getByLabelText('1,234')).toBeTruthy();
    });

    it('decimal preset honours fractionDigits', () => {
        const { getByLabelText } = render(
            <AnimatedNumber
                value={3.14159}
                format={{ kind: 'decimal', fractionDigits: 2 }}
                locale="en-US"
            />,
        );
        expect(getByLabelText('3.14')).toBeTruthy();
    });

    it('percent preset appends % and uses the value as already-multiplied', () => {
        const { getByLabelText } = render(
            <AnimatedNumber
                value={75.3}
                format={{ kind: 'percent' }}
                locale="en-US"
            />,
        );
        // value 75.3 -> "75.3" + "%". Confirms we are NOT using
        // Intl's style:'percent' (which would render "7,530%").
        expect(getByLabelText('75.3%')).toBeTruthy();
    });

    it('percent preset honours fractionDigits=0', () => {
        const { getByLabelText } = render(
            <AnimatedNumber
                value={42}
                format={{ kind: 'percent', fractionDigits: 0 }}
                locale="en-US"
            />,
        );
        expect(getByLabelText('42%')).toBeTruthy();
    });

    it('currency preset renders the locale-appropriate symbol', () => {
        const { getByLabelText } = render(
            <AnimatedNumber
                value={1499.99}
                format={{ kind: 'currency', currency: 'USD' }}
                locale="en-US"
            />,
        );
        expect(getByLabelText('$1,499.99')).toBeTruthy();
    });

    it('intl passthrough preset uses the supplied options verbatim', () => {
        const { getByLabelText } = render(
            <AnimatedNumber
                value={1500000}
                format={{
                    kind: 'intl',
                    options: { notation: 'compact', maximumFractionDigits: 1 },
                }}
                locale="en-US"
            />,
        );
        expect(getByLabelText('1.5M')).toBeTruthy();
    });
});

describe('AnimatedNumber — static fallback', () => {
    it('renders the formatted value as plain text when animate=false', () => {
        const { container, getByLabelText } = render(
            <AnimatedNumber
                value={42}
                format={{ kind: 'integer' }}
                locale="en-US"
                animate={false}
            />,
        );
        expect(getByLabelText('42')).toBeTruthy();
        // The static path should not mount the NumberFlow mock.
        expect(container.querySelector('[data-testid="number-flow"]')).toBeNull();
        expect(
            container.querySelector('[data-animated-number="static"]'),
        ).not.toBeNull();
    });

    it('animate=true mounts the NumberFlow component', () => {
        const { container } = render(
            <AnimatedNumber value={10} format={{ kind: 'integer' }} animate />,
        );
        expect(
            container.querySelector('[data-animated-number="animated"]'),
        ).not.toBeNull();
        expect(container.querySelector('[data-testid="number-flow"]')).not.toBeNull();
    });
});

describe('AnimatedNumber — trend semantic', () => {
    it.each(['up', 'down', 'neutral'] as const)(
        'surfaces trend="%s" as data-trend',
        (trend) => {
            const { container } = render(
                <AnimatedNumber value={5} format={{ kind: 'integer' }} trend={trend} />,
            );
            expect(
                container.querySelector(`[data-trend="${trend}"]`),
            ).not.toBeNull();
        },
    );

    it('omits data-trend when trend is not provided', () => {
        const { container } = render(
            <AnimatedNumber value={5} format={{ kind: 'integer' }} />,
        );
        const node = container.querySelector('[data-animated-number]');
        expect(node?.getAttribute('data-trend')).toBeNull();
    });
});

describe('AnimatedNumber — prefix/suffix composition', () => {
    it('combines preset suffix with caller suffix', () => {
        const { getByLabelText } = render(
            <AnimatedNumber
                value={3.5}
                format={{ kind: 'percent' }}
                locale="en-US"
                suffix=" / yr"
            />,
        );
        expect(getByLabelText('3.5% / yr')).toBeTruthy();
    });

    it('respects prefix in the accessible name', () => {
        const { getByLabelText } = render(
            <AnimatedNumber
                value={42}
                format={{ kind: 'integer' }}
                locale="en-US"
                prefix="~"
            />,
        );
        expect(getByLabelText('~42')).toBeTruthy();
    });

    it('aria-label override wins over derived label', () => {
        const { getByLabelText } = render(
            <AnimatedNumber
                value={42}
                format={{ kind: 'integer' }}
                aria-label="Forty-two findings"
            />,
        );
        expect(getByLabelText('Forty-two findings')).toBeTruthy();
    });
});

describe('AnimatedNumber — unchanged value', () => {
    it('renders identical output when re-rendered with the same value', () => {
        const { container, rerender } = render(
            <AnimatedNumber value={123} format={{ kind: 'integer' }} locale="en-US" />,
        );
        const before = container.innerHTML;
        rerender(
            <AnimatedNumber value={123} format={{ kind: 'integer' }} locale="en-US" />,
        );
        expect(container.innerHTML).toBe(before);
    });

    it('renders different output when value changes', () => {
        const { container, rerender } = render(
            <AnimatedNumber value={1} format={{ kind: 'integer' }} locale="en-US" />,
        );
        const before = container.innerHTML;
        rerender(
            <AnimatedNumber value={2} format={{ kind: 'integer' }} locale="en-US" />,
        );
        expect(container.innerHTML).not.toBe(before);
    });
});

describe('AnimatedNumber — edge cases', () => {
    it('handles zero as a legitimate value (no special-case rendering)', () => {
        const { getByLabelText } = render(
            <AnimatedNumber
                value={0}
                format={{ kind: 'integer' }}
                locale="en-US"
            />,
        );
        // Zero must render as "0" — never as "—" or empty (those
        // belong to consumer null-handling, not the primitive).
        expect(getByLabelText('0')).toBeTruthy();
    });

    it('renders negative integers with a minus sign', () => {
        const { getByLabelText } = render(
            <AnimatedNumber
                value={-1234}
                format={{ kind: 'integer' }}
                locale="en-US"
            />,
        );
        expect(getByLabelText('-1,234')).toBeTruthy();
    });

    it('formats very large numbers with Intl grouping', () => {
        const { getByLabelText } = render(
            <AnimatedNumber
                value={1234567890}
                format={{ kind: 'integer' }}
                locale="en-US"
            />,
        );
        expect(getByLabelText('1,234,567,890')).toBeTruthy();
    });

    it('respects a different locale (de-DE uses dot as group separator)', () => {
        const { getByLabelText } = render(
            <AnimatedNumber
                value={1234567}
                format={{ kind: 'integer' }}
                locale="de-DE"
            />,
        );
        // de-DE: "1.234.567"
        expect(getByLabelText('1.234.567')).toBeTruthy();
    });

    it('formats EUR currency with the locale-appropriate symbol position', () => {
        const { getByLabelText } = render(
            <AnimatedNumber
                value={1234.5}
                format={{ kind: 'currency', currency: 'EUR' }}
                locale="de-DE"
            />,
        );
        // Intl produces "1.234,50 €" for de-DE EUR. The exact glyphs
        // depend on the JS engine's CLDR data; assert via the text
        // content rather than a hardcoded narrow no-break space, but
        // require both the symbol and the digits be present.
        const node = getByLabelText(/1\.234,50.*€/);
        expect(node).toBeTruthy();
    });

    it('preserves the data-trend attribute through re-render', () => {
        const { container, rerender } = render(
            <AnimatedNumber value={1} trend="up" />,
        );
        expect(container.querySelector('[data-trend="up"]')).not.toBeNull();
        rerender(<AnimatedNumber value={2} trend="up" />);
        // Same trend after re-render — attribute survives.
        expect(container.querySelector('[data-trend="up"]')).not.toBeNull();
    });
});
