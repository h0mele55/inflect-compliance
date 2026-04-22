/**
 * Setup for the jsdom Jest project.
 *
 *   - Registers `@testing-library/jest-dom` matchers (toBeInTheDocument,
 *     toHaveAccessibleName, toBeVisible, etc.) so the rendered tests
 *     read like a WCAG contract rather than a DOM dump.
 *   - Extends `expect` with `toHaveNoViolations` from jest-axe so every
 *     primitive can gate on axe-core WCAG 2.1 AA rules.
 *   - Cleans up the DOM between tests (React Testing Library's default).
 *   - Polyfills matchMedia + IntersectionObserver + ResizeObserver so
 *     the primitives that depend on them (useMediaQuery in Modal/Sheet,
 *     Vaul's scroll observer) don't throw in jsdom.
 */

import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

afterEach(() => {
    cleanup();
});

// ─── jsdom polyfills ────────────────────────────────────────────

// matchMedia — useMediaQuery() relies on it.
if (typeof window !== 'undefined' && !window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: (query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: jest.fn(),
            removeListener: jest.fn(),
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            dispatchEvent: jest.fn(),
        }),
    });
}

// IntersectionObserver — Radix / Vaul occasionally probe this.
if (typeof window !== 'undefined' && !('IntersectionObserver' in window)) {
    class MockIntersectionObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
            return [];
        }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).IntersectionObserver = MockIntersectionObserver;
}

// ResizeObserver — Radix Popover measures triggers for positioning.
if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
    class MockResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ResizeObserver = MockResizeObserver;
}

// PointerEvent polyfill — Radix Dialog emits pointer events on focus
// trap enter/leave; jsdom doesn't ship PointerEvent natively.
if (typeof window !== 'undefined' && !('PointerEvent' in window)) {
    class MockPointerEvent extends MouseEvent {
        pointerId: number;
        pointerType: string;
        constructor(type: string, props: PointerEventInit = {}) {
            super(type, props);
            this.pointerId = props.pointerId ?? 0;
            this.pointerType = props.pointerType ?? 'mouse';
        }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).PointerEvent = MockPointerEvent;
}

// HTMLElement.scrollIntoView — cmdk uses it for keyboard nav; jsdom
// doesn't implement it.
if (
    typeof window !== 'undefined' &&
    !Element.prototype.scrollIntoView
) {
    Element.prototype.scrollIntoView = jest.fn();
}

// window.scrollTo — motion-dom's keyframe resolver probes it during
// `measureAllKeyframes` on animation-frame ticks. jsdom ships a stub
// that throws "Not implemented", which surfaces as a console.error
// noise storm in any test that renders a <motion.*> component.
if (typeof window !== 'undefined') {
    window.scrollTo = jest.fn() as unknown as typeof window.scrollTo;
}

// Element.hasPointerCapture — Radix relies on it.
if (
    typeof window !== 'undefined' &&
    !Element.prototype.hasPointerCapture
) {
    Element.prototype.hasPointerCapture = jest.fn(() => false);
}
if (
    typeof window !== 'undefined' &&
    !Element.prototype.setPointerCapture
) {
    Element.prototype.setPointerCapture = jest.fn();
}
if (
    typeof window !== 'undefined' &&
    !Element.prototype.releasePointerCapture
) {
    Element.prototype.releasePointerCapture = jest.fn();
}
