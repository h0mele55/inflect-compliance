/**
 * Rendered tests for <FormField>, <FormDescription>, <FormError>,
 * <FieldGroup>.
 *
 * Verifies the runtime a11y wiring that source-contract tests only
 * approximated: the label's `htmlFor` really points at the injected
 * control id, `aria-describedby` chains description + error ids
 * correctly, `aria-invalid` flips under error, required asterisk
 * surfaces as `aria-required` on the control.
 */

import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import * as React from 'react';
import { FormField } from '@/components/ui/form-field';
import { FormDescription } from '@/components/ui/form-description';
import { FormError } from '@/components/ui/form-error';
import { FieldGroup } from '@/components/ui/field-group';
import { Input } from '@/components/ui/input';

describe('<FormField /> — a11y wiring', () => {
    it('generates a stable id + wires label htmlFor to the control', () => {
        render(
            <FormField label="Email">
                <Input type="email" />
            </FormField>,
        );
        const input = screen.getByRole('textbox', { name: 'Email' });
        expect(input).toBeInTheDocument();
        const label = screen.getByText('Email');
        expect(label).toHaveAttribute('for', input.id);
    });

    it('preserves a caller-supplied child id', () => {
        render(
            <FormField label="Email">
                <Input id="my-email" type="email" />
            </FormField>,
        );
        const input = screen.getByRole('textbox', { name: 'Email' });
        expect(input).toHaveAttribute('id', 'my-email');
    });

    it('renders description and chains it into aria-describedby', () => {
        render(
            <FormField label="Email" description="We will only email you about audits.">
                <Input type="email" />
            </FormField>,
        );
        const input = screen.getByRole('textbox', { name: 'Email' });
        const desc = screen.getByText(/only email you about audits/);
        expect(input.getAttribute('aria-describedby')).toContain(desc.id);
    });

    it('error beats description, sets aria-invalid + role=alert', () => {
        render(
            <FormField
                label="Email"
                description="We will only email you about audits."
                error="Email is required"
            >
                <Input type="email" />
            </FormField>,
        );
        const input = screen.getByRole('textbox', { name: 'Email' });
        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(
            screen.queryByText(/only email you about audits/),
        ).not.toBeInTheDocument();
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('Email is required');
        expect(alert).toHaveAttribute('aria-live', 'polite');
        expect(input.getAttribute('aria-describedby')).toContain(alert.id);
    });

    it('required marker sets aria-required and aria-hidden on the asterisk', () => {
        render(
            <FormField label="Email" required>
                <Input type="email" />
            </FormField>,
        );
        const input = screen.getByRole('textbox', { name: 'Email' });
        expect(input).toHaveAttribute('aria-required', 'true');
        // The asterisk is visual-only.
        const asterisk = screen.getByText('*');
        expect(asterisk).toHaveAttribute('aria-hidden', 'true');
    });

    it('has no WCAG violations (valid state)', async () => {
        const { container } = render(
            <FormField label="Email" description="Used for audit notifications.">
                <Input type="email" defaultValue="alice@example.com" />
            </FormField>,
        );
        expect(await axe(container)).toHaveNoViolations();
    });

    it('has no WCAG violations (error state)', async () => {
        const { container } = render(
            <FormField label="Email" error="Email is required" required>
                <Input type="email" />
            </FormField>,
        );
        expect(await axe(container)).toHaveNoViolations();
    });
});

// ─── FormDescription / FormError standalone ────────────────────

describe('<FormDescription />', () => {
    it('renders muted helper text', () => {
        render(<FormDescription>Shown on audit reports.</FormDescription>);
        const p = screen.getByText('Shown on audit reports.');
        expect(p.tagName).toBe('P');
        expect(p).toHaveAttribute('data-form-description');
    });
});

describe('<FormError />', () => {
    it('renders role=alert with aria-live=polite', () => {
        render(<FormError>Required</FormError>);
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('Required');
        expect(alert).toHaveAttribute('aria-live', 'polite');
    });

    it('renders nothing on empty children', () => {
        const { container } = render(<FormError>{''}</FormError>);
        expect(container.firstChild).toBeNull();
    });

    it('renders nothing when visible=false', () => {
        const { container } = render(<FormError visible={false}>Err</FormError>);
        expect(container.firstChild).toBeNull();
    });
});

// ─── FieldGroup ────────────────────────────────────────────────

describe('<FieldGroup />', () => {
    it('renders a labelled section when title is set', () => {
        render(
            <FieldGroup title="Contact" description="How we reach you">
                <FormField label="Email">
                    <Input type="email" />
                </FormField>
            </FieldGroup>,
        );
        const section = screen.getByRole('group', { name: 'Contact' });
        expect(section).toBeInTheDocument();
        expect(screen.getByText('How we reach you')).toBeInTheDocument();
    });

    it('renders an unlabelled section when no title', () => {
        const { container } = render(
            <FieldGroup>
                <FormField label="Email">
                    <Input type="email" />
                </FormField>
            </FieldGroup>,
        );
        // No title means no role=group requirement.
        expect(container.querySelector('[data-field-group]')).toBeInTheDocument();
    });

    it('has no WCAG violations', async () => {
        const { container } = render(
            <FieldGroup title="Contact" description="How we reach you" columns={2}>
                <FormField label="First name">
                    <Input />
                </FormField>
                <FormField label="Last name">
                    <Input />
                </FormField>
            </FieldGroup>,
        );
        expect(await axe(container)).toHaveNoViolations();
    });
});
