/**
 * Epic 64 — `<ProgressiveBlur>` primitive.
 *
 * jsdom doesn't compute backdrop-filter, mask images, or actual
 * blur — but it does observe the structural contract: pinned
 * positioning, side-direction selection, layer count derived from
 * `steps`, and the `both` shorthand fanning into top + bottom.
 */
/** @jest-environment jsdom */

import * as React from 'react';
import { render } from '@testing-library/react';

import { ProgressiveBlur } from '@/components/ui/progressive-blur';

describe('ProgressiveBlur — single side', () => {
    it.each(['top', 'bottom', 'left', 'right'] as const)(
        'renders the side="%s" attribute on the wrapper',
        (side) => {
            const { container } = render(<ProgressiveBlur side={side} />);
            const wrapper = container.querySelector(
                `[data-progressive-blur="${side}"]`,
            );
            expect(wrapper).not.toBeNull();
        },
    );

    it('defaults side to "top" when omitted', () => {
        const { container } = render(<ProgressiveBlur />);
        expect(
            container.querySelector('[data-progressive-blur="top"]'),
        ).not.toBeNull();
    });

    it('mounts `steps` blur layers (4 by default)', () => {
        const { container } = render(<ProgressiveBlur />);
        // Layer count = steps. Each layer is a child of the inner relative div.
        const inner = container.querySelector(
            '[data-progressive-blur] > div',
        );
        expect(inner?.children.length).toBe(4);
    });

    it('honours steps=2 (drops the > 2 layers)', () => {
        const { container } = render(<ProgressiveBlur steps={2} />);
        const inner = container.querySelector(
            '[data-progressive-blur] > div',
        );
        expect(inner?.children.length).toBe(2);
    });

    it('honours steps=6 (mounts six layers)', () => {
        const { container } = render(<ProgressiveBlur steps={6} />);
        const inner = container.querySelector(
            '[data-progressive-blur] > div',
        );
        expect(inner?.children.length).toBe(6);
    });

    it('top/bottom use a height-constrained band', () => {
        const { container } = render(
            <ProgressiveBlur side="bottom" size="6rem" />,
        );
        const wrapper = container.querySelector(
            '[data-progressive-blur="bottom"]',
        ) as HTMLElement;
        expect(wrapper.style.height).toBe('6rem');
        expect(wrapper.style.width).toBe('');
    });

    it('left/right use a width-constrained band', () => {
        const { container } = render(
            <ProgressiveBlur side="right" size="6rem" />,
        );
        const wrapper = container.querySelector(
            '[data-progressive-blur="right"]',
        ) as HTMLElement;
        expect(wrapper.style.width).toBe('6rem');
        expect(wrapper.style.height).toBe('');
    });

    it('positions to the matching edge via Tailwind classes', () => {
        const { container } = render(<ProgressiveBlur side="bottom" />);
        const wrapper = container.querySelector(
            '[data-progressive-blur="bottom"]',
        ) as HTMLElement;
        expect(wrapper.className).toContain('bottom-0');
        expect(wrapper.className).toContain('left-0');
        expect(wrapper.className).toContain('right-0');
    });

    it('is pointer-events-none so clicks pass through to the scroller', () => {
        const { container } = render(<ProgressiveBlur side="top" />);
        const wrapper = container.querySelector(
            '[data-progressive-blur="top"]',
        ) as HTMLElement;
        expect(wrapper.className).toContain('pointer-events-none');
    });

    it('layer mask uses the opposite-side gradient direction', () => {
        const { container } = render(<ProgressiveBlur side="top" steps={2} />);
        const inner = container.querySelector(
            '[data-progressive-blur] > div',
        );
        const layer0 = inner?.children[0] as HTMLElement;
        // top side ⇒ mask ramps "to bottom"
        expect(layer0.style.mask).toContain('to bottom');
    });
});

describe('ProgressiveBlur — both shorthand', () => {
    it('mounts both top and bottom wrappers', () => {
        const { container } = render(<ProgressiveBlur side="both" />);
        expect(
            container.querySelector('[data-progressive-blur="top"]'),
        ).not.toBeNull();
        expect(
            container.querySelector('[data-progressive-blur="bottom"]'),
        ).not.toBeNull();
        // No 'both' literal data attribute — the shorthand fans out.
        expect(
            container.querySelector('[data-progressive-blur="both"]'),
        ).toBeNull();
    });

    it('passes strength + steps + size to both children', () => {
        const { container } = render(
            <ProgressiveBlur side="both" steps={3} size="4rem" />,
        );
        const top = container.querySelector(
            '[data-progressive-blur="top"]',
        ) as HTMLElement;
        const bottom = container.querySelector(
            '[data-progressive-blur="bottom"]',
        ) as HTMLElement;
        expect(top.style.height).toBe('4rem');
        expect(bottom.style.height).toBe('4rem');
        // 3 layers each.
        expect(top.querySelector(':scope > div')?.children.length).toBe(3);
        expect(bottom.querySelector(':scope > div')?.children.length).toBe(3);
    });
});

describe('ProgressiveBlur — passthrough', () => {
    it('forwards className to the wrapper', () => {
        const { container } = render(
            <ProgressiveBlur side="top" className="opacity-80" />,
        );
        const wrapper = container.querySelector(
            '[data-progressive-blur="top"]',
        ) as HTMLElement;
        expect(wrapper.className).toContain('opacity-80');
    });

    it('forwards data-testid to the wrapper', () => {
        const { getByTestId } = render(
            <ProgressiveBlur side="top" data-testid="sheet-edge-fade" />,
        );
        expect(getByTestId('sheet-edge-fade')).toBeTruthy();
    });

    it('respects an explicit zIndex via inline style', () => {
        const { container } = render(
            <ProgressiveBlur side="top" style={{ zIndex: 10 }} />,
        );
        const wrapper = container.querySelector(
            '[data-progressive-blur="top"]',
        ) as HTMLElement;
        expect(wrapper.style.zIndex).toBe('10');
    });
});
