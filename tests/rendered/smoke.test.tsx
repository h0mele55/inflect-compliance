/**
 * jsdom project smoke-test. Proves the harness boots, renders a React
 * tree, and the jest-dom + jest-axe matchers are registered.
 */
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import * as React from 'react';

describe('jsdom harness', () => {
    it('renders a React tree', () => {
        render(<button aria-label="Hi">Hello</button>);
        expect(screen.getByRole('button', { name: /hi/i })).toBeInTheDocument();
    });

    it('has jest-axe matchers registered', async () => {
        const { container } = render(
            <main>
                <h1>Accessible page</h1>
                <button type="button">Click</button>
            </main>,
        );
        expect(await axe(container)).toHaveNoViolations();
    });
});
