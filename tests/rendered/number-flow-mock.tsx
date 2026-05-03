/**
 * Passthrough mock for `@number-flow/react` used by every jsdom
 * render test (wired in `jest.config.js → jsdomProject.moduleNameMapper`).
 *
 * Why mock at all: the real NumberFlow depends on the Web Animations
 * API and a custom-element runtime that jsdom only partially supports.
 * Tests that just want to assert on the formatted text would otherwise
 * see an empty shadow root or a missing text node.
 *
 * The mock renders the same `Intl.NumberFormat` output that
 * NumberFlow would settle on once its animation completes — so
 * `getByText('75.3%')`, `toHaveAccessibleName(...)`, and any
 * `data-testid` queries in consumer card tests behave deterministically.
 */
import * as React from 'react';

interface MockProps {
    value: number;
    format?: Intl.NumberFormatOptions;
    locales?: Intl.LocalesArgument;
    prefix?: string;
    suffix?: string;
}

function MockNumberFlow({ value, format, locales, prefix, suffix }: MockProps) {
    const body = new Intl.NumberFormat(locales, format).format(value);
    return (
        <span data-testid="number-flow">
            {prefix ?? ''}
            {body}
            {suffix ?? ''}
        </span>
    );
}

export default MockNumberFlow;
