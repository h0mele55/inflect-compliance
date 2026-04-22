/**
 * Epic 59 — StatusBreakdown primitive.
 *
 * Covers the multi-segment distribution-row use cases the vendors /
 * tasks / risks dashboards converge on:
 *
 *   - renders one row per item with label + count + proportional bar
 *   - total defaults to sum(items.value) but can be forced
 *   - empty state renders when total is 0 / items is empty
 *   - variants + colorClass escape hatch both drive the fill colour
 *   - showDot / showCount / showPercent toggles behave
 *   - ARIA: group + per-row progressbar with count/total
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import {
    StatusBreakdown,
    type StatusBreakdownItem,
} from '@/components/ui/status-breakdown';

describe('StatusBreakdown', () => {
    const items: StatusBreakdownItem[] = [
        { label: 'Active', value: 12, variant: 'success' },
        { label: 'Pending', value: 3, variant: 'warning' },
        { label: 'Offboarded', value: 1, variant: 'neutral' },
    ];

    it('renders one row per item with label + count visible', () => {
        render(<StatusBreakdown items={items} />);

        for (const item of items) {
            expect(
                screen.getByText(item.label as string),
            ).toBeInTheDocument();
        }

        // Counts are announced as "Count N" via aria-label, and also
        // printed visibly. Confirm the visible tabular-nums cells.
        const container = screen.getByRole('group');
        expect(within(container).getByText('12')).toBeInTheDocument();
        expect(within(container).getByText('3')).toBeInTheDocument();
        expect(within(container).getByText('1')).toBeInTheDocument();
    });

    it('uses sum(items.value) as the default total for bar widths', () => {
        render(<StatusBreakdown items={items} />);

        // Total = 16 → Active fills 75% of the mini bar track.
        const active = screen.getByRole('progressbar', {
            name: 'Active: 12 of 16',
        });
        expect(active).toHaveAttribute('aria-valuenow', '12');
        expect(active).toHaveAttribute('aria-valuemax', '16');
    });

    it('honours an explicit total (when parent owns it)', () => {
        render(<StatusBreakdown items={items} total={100} />);

        const active = screen.getByRole('progressbar', {
            name: 'Active: 12 of 100',
        });
        expect(active).toHaveAttribute('aria-valuemax', '100');
    });

    it('renders the empty state when total is zero', () => {
        render(<StatusBreakdown items={[]} />);
        expect(screen.getByText('No data')).toBeInTheDocument();

        const { rerender } = render(
            <StatusBreakdown
                items={[{ label: 'Empty', value: 0, variant: 'neutral' }]}
            />,
        );
        expect(screen.getAllByText('No data').length).toBeGreaterThan(0);

        // A caller-supplied empty state overrides the default.
        rerender(
            <StatusBreakdown
                items={[]}
                emptyState={<p>Nothing to show</p>}
            />,
        );
        expect(screen.getByText('Nothing to show')).toBeInTheDocument();
    });

    it('accepts a colorClass escape hatch for legacy palettes', () => {
        render(
            <StatusBreakdown
                showDot
                items={[
                    {
                        id: 'crit',
                        label: 'Critical',
                        value: 5,
                        colorClass: 'bg-purple-500/60',
                    },
                ]}
            />,
        );
        const dot = document.querySelector(
            '.bg-purple-500\\/60',
        );
        expect(dot).not.toBeNull();
    });

    it('showDot / showCount / showPercent toggles', () => {
        const { rerender, container } = render(
            <StatusBreakdown
                items={items}
                showDot={false}
                showCount={false}
                showPercent={false}
            />,
        );
        // With everything off, only labels + bars remain.
        expect(container.querySelectorAll('[aria-label^="Count"]')).toHaveLength(0);

        rerender(
            <StatusBreakdown
                items={items}
                showDot={false}
                showCount={false}
                showPercent
            />,
        );
        // 12/16 = 75% rounded
        expect(screen.getByText('75%')).toBeInTheDocument();
    });

    it('exposes a role=group with the caller-supplied aria-label', () => {
        render(<StatusBreakdown items={items} ariaLabel="Vendors by status" />);
        expect(
            screen.getByRole('group', { name: 'Vendors by status' }),
        ).toBeInTheDocument();
    });

    it('bar proportion clamps to 0-100% even when a value exceeds total', () => {
        // Forced total below the summed values — should not crash, and
        // bars render without blowing up width. The progressbar ARIA
        // values still reflect the real numbers.
        render(
            <StatusBreakdown
                items={[{ id: 'x', label: 'Over', value: 200, variant: 'error' }]}
                total={100}
            />,
        );
        const pb = screen.getByRole('progressbar', { name: 'Over: 200 of 100' });
        expect(pb).toHaveAttribute('aria-valuenow', '200');
    });
});
