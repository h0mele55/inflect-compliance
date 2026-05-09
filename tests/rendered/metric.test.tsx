/**
 * Polish PR-2 — rendered tests for the Metric primitives.
 *
 * Locks the typographic + tone + tabular-nums + trend-arrow contract
 * so any future "tweak" to the primitives gets caught at CI time.
 */

import { render, screen } from '@testing-library/react';
import * as React from 'react';

import { HeroMetric, KPIStat } from '@/components/ui/metric';

describe('<HeroMetric />', () => {
    it('renders value, label, and tabular-nums on the value', () => {
        render(<HeroMetric value={42} label="Active risks" />);
        expect(screen.getByText('42')).toBeInTheDocument();
        expect(screen.getByText('Active risks')).toBeInTheDocument();
        const valueEl = screen.getByText('42');
        expect(valueEl.className).toContain('tabular-nums');
        expect(valueEl.className).toContain('font-semibold');
    });

    it('applies tone classes when tone is supplied', () => {
        const { rerender } = render(
            <HeroMetric value={1} label="X" tone="critical" />,
        );
        expect(screen.getByText('1').className).toContain('text-content-error');
        rerender(<HeroMetric value={1} label="X" tone="success" />);
        expect(screen.getByText('1').className).toContain('text-content-success');
        rerender(<HeroMetric value={1} label="X" tone="attention" />);
        expect(screen.getByText('1').className).toContain('text-content-warning');
    });

    it('renders a trend indicator with the right tone for direction', () => {
        render(
            <HeroMetric
                value={100}
                label="Tasks"
                trend={{ direction: 'up', magnitude: '12%', goodDirection: 'down' }}
            />,
        );
        // 'up' when goodDirection='down' is critical.
        const indicator = screen.getByText('12%').parentElement!;
        expect(indicator.className).toContain('text-content-error');
    });

    it('renders a description when supplied', () => {
        render(
            <HeroMetric
                value={10}
                label="Risks"
                description="vs. last quarter"
            />,
        );
        expect(screen.getByText('vs. last quarter')).toBeInTheDocument();
    });
});

describe('<KPIStat />', () => {
    it('renders value, label, and a default size of md', () => {
        render(<KPIStat value={99} label="Total" />);
        const v = screen.getByText('99');
        expect(v.className).toContain('text-3xl'); // md size
        expect(v.className).toContain('tabular-nums');
        expect(screen.getByText('Total')).toBeInTheDocument();
    });

    it('renders sm size with a smaller value', () => {
        render(<KPIStat value={99} label="Total" size="sm" />);
        expect(screen.getByText('99').className).toContain('text-xl');
    });

    it('uppercases the label as an eyebrow', () => {
        render(<KPIStat value={1} label="Overdue" />);
        const labelEl = screen.getByText('Overdue');
        expect(labelEl.className).toContain('uppercase');
        expect(labelEl.className).toContain('tracking-wide');
    });

    it('wraps in an anchor when href is supplied', () => {
        render(<KPIStat value={1} label="L" href="/foo" />);
        const anchor = screen.getByRole('link');
        expect(anchor.getAttribute('href')).toBe('/foo');
    });

    it('renders a flat trend with no tone', () => {
        render(
            <KPIStat
                value={5}
                label="X"
                trend={{ direction: 'flat', magnitude: '0' }}
            />,
        );
        const indicator = screen.getByText('0').parentElement!;
        // flat → tone 'default' → text-content-emphasis (not error/success)
        expect(indicator.className).toContain('text-content-emphasis');
    });

    it('honours tone prop on the value colour', () => {
        render(<KPIStat value={3} label="Overdue" tone="critical" />);
        expect(screen.getByText('3').className).toContain('text-content-error');
    });
});
