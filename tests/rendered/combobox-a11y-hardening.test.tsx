/**
 * Epic 55 hardening — Combobox a11y fixes that the render-test pass
 * uncovered (role="combobox", computed aria-label, hideSearch a11y).
 *
 * These are regression tests for gaps the jsdom harness caught during
 * the Tier 1 rollout. Kept as a separate file so future contributors
 * can spot the hardening-specific coverage quickly.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import * as React from 'react';
import {
    Combobox,
    COMBOBOX_DEFAULT_MESSAGES,
    type ComboboxOption,
} from '@/components/ui/combobox';

const COLOURS: ComboboxOption[] = [
    { value: 'red', label: 'Red' },
    { value: 'green', label: 'Green' },
    { value: 'blue', label: 'Blue' },
];

function Harness(props: {
    selectedValue?: string | null;
    placeholder?: string;
    hideSearch?: boolean;
}) {
    const [selected, setSelected] = React.useState<ComboboxOption | null>(
        props.selectedValue
            ? (COLOURS.find((c) => c.value === props.selectedValue) ?? null)
            : null,
    );
    return (
        <Combobox
            id="colour-picker"
            options={COLOURS}
            selected={selected}
            setSelected={setSelected}
            placeholder={props.placeholder}
            hideSearch={props.hideSearch}
        />
    );
}

describe('Combobox — role + aria-label hardening', () => {
    it('trigger carries role="combobox" for assistive-tech parity', () => {
        render(<Harness placeholder="Pick a colour" />);
        const trigger = screen.getByRole('combobox');
        expect(trigger).toHaveAttribute('role', 'combobox');
    });

    it('aria-label defaults to the placeholder when nothing is selected', () => {
        render(<Harness placeholder="Pick a colour" />);
        expect(screen.getByRole('combobox')).toHaveAttribute(
            'aria-label',
            'Pick a colour',
        );
    });

    it('aria-label reflects the selected label once a choice is made', () => {
        render(<Harness selectedValue="green" />);
        expect(screen.getByRole('combobox')).toHaveAttribute(
            'aria-label',
            'Green',
        );
    });

    it('falls back to "Select" when neither placeholder nor selection is present', () => {
        render(
            <Combobox
                id="naked"
                options={COLOURS}
                selected={null}
                setSelected={() => {}}
            />,
        );
        const trigger = screen.getByRole('combobox');
        // COMBOBOX_DEFAULT_MESSAGES.placeholder is "Select…" — the
        // default placeholder; aria-label mirrors it when the prop
        // itself is a ReactNode that stringifies cleanly.
        expect(trigger).toHaveAttribute(
            'aria-label',
            COMBOBOX_DEFAULT_MESSAGES.placeholder,
        );
    });

    it('hideSearch mode keeps axe-clean (no hidden-search label violations)', async () => {
        const user = userEvent.setup();
        const { container } = render(
            <Harness placeholder="Pick a colour" hideSearch />,
        );
        await user.click(screen.getByRole('combobox'));
        // Listbox renders without a search input.
        const listbox = await screen.findByRole('listbox');
        expect(
            within(listbox).queryByPlaceholderText(
                COMBOBOX_DEFAULT_MESSAGES.searchPlaceholder,
            ),
        ).not.toBeInTheDocument();
        expect(await axe(container)).toHaveNoViolations();
    });
});

// ─── i18n message defaults ─────────────────────────────────────

describe('Combobox — message defaults', () => {
    it('exposes COMBOBOX_DEFAULT_MESSAGES with the four required keys', () => {
        expect(COMBOBOX_DEFAULT_MESSAGES.placeholder).toBe('Select…');
        expect(COMBOBOX_DEFAULT_MESSAGES.searchPlaceholder).toBe('Search…');
        expect(COMBOBOX_DEFAULT_MESSAGES.emptyState).toBe('No matches');
        expect(COMBOBOX_DEFAULT_MESSAGES.createLabel('Foo')).toBe(
            'Create "Foo"',
        );
        expect(COMBOBOX_DEFAULT_MESSAGES.createLabel('')).toBe(
            'Create new option…',
        );
    });
});
