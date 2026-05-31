/**
 * Button label-centering behavioural lock.
 *
 * User report (2026-05-31): two button-styled controls rendered with
 * their text label visually off-centre — a control-status trigger
 * with a large void on the right, and (the suspected case) a primary
 * CTA. The systemic fix lives in the Button primitive: the label is
 * centred via `justify-center`, and any UNBALANCED side weight (a
 * leading icon, or trailing `right` content) is mirrored by an
 * INVISIBLE balance ghost on the opposite edge so the visible label
 * sits at the button's geometric centre.
 *
 *   leading icon   → trailing ghost  ([data-icon-balance-ghost])
 *   trailing right → leading ghost   ([data-right-balance-ghost])
 *
 * jsdom has no layout engine, so this test cannot measure pixel
 * centring. Instead it locks the MECHANISM that produces centring:
 * the correct balance ghost renders for each prop shape, and the
 * intentional NON-centred exceptions (shortcut buttons, icon-only
 * buttons) do not. If a refactor drops a ghost, the off-centre
 * regression returns and this test fails.
 *
 * The static companion `tests/guards/button-label-centering.test.ts`
 * locks the primitive source + scans call sites for centring-
 * defeating className overrides.
 */
import * as React from 'react';
import { render } from '@testing-library/react';
import { Button } from '@/components/ui/button';

const Dot = () => <span data-x-dot className="size-4 rounded-full" />;

describe('Button label centering — balance-ghost mechanism', () => {
    test('text-only button: no balance ghost, label is the only flow child', () => {
        const { container } = render(<Button>Resolve overdue tasks</Button>);
        expect(container.querySelector('[data-icon-balance-ghost]')).toBeNull();
        expect(container.querySelector('[data-right-balance-ghost]')).toBeNull();
        const btn = container.querySelector('button')!;
        // The centring contract: the label lives in a justify-center
        // flex button (the cva base). tailwind-merge keeps the last
        // `justify-*`, so the presence of justify-center here means no
        // override defeated it.
        expect(btn.className).toMatch(/justify-center/);
    });

    test('leading icon + label: trailing ghost balances the icon', () => {
        const { container } = render(
            <Button icon={<Dot />}>Control</Button>,
        );
        const ghost = container.querySelector('[data-icon-balance-ghost]');
        expect(ghost).not.toBeNull();
        // Ghost is invisible + inert.
        expect(ghost!.className).toMatch(/invisible/);
        expect(ghost!.className).toMatch(/pointer-events-none/);
        expect(ghost!.getAttribute('aria-hidden')).toBe('true');
        // Ghost mirrors the icon (carries the same dot child).
        expect(ghost!.querySelector('[data-x-dot]')).not.toBeNull();
    });

    test('trailing right + label (no icon): leading ghost balances the right', () => {
        const { container } = render(
            <Button right={<Dot />}>Save changes</Button>,
        );
        const ghost = container.querySelector('[data-right-balance-ghost]');
        expect(ghost).not.toBeNull();
        expect(ghost!.className).toMatch(/invisible/);
        expect(ghost!.className).toMatch(/pointer-events-none/);
        expect(ghost!.getAttribute('aria-hidden')).toBe('true');
        expect(ghost!.querySelector('[data-x-dot]')).not.toBeNull();
        // The leading ghost renders BEFORE the label wrapper so the
        // flex group is [ghost][label][right] — symmetric around the
        // label.
        const btn = container.querySelector('button')!;
        const kids = Array.from(btn.children);
        const ghostIdx = kids.indexOf(ghost as Element);
        const labelIdx = kids.findIndex((k) => k.textContent === 'Save changes');
        expect(ghostIdx).toBeGreaterThanOrEqual(0);
        expect(labelIdx).toBeGreaterThan(ghostIdx);
    });

    test('shortcut button: intentionally NOT centred (label left, kbd right)', () => {
        const { container } = render(
            <Button shortcut="K">Command</Button>,
        );
        // No balance ghosts — the kbd owns the trailing weight and the
        // label deliberately left-aligns via flex-1 text-left.
        expect(container.querySelector('[data-icon-balance-ghost]')).toBeNull();
        expect(container.querySelector('[data-right-balance-ghost]')).toBeNull();
        const labelWrapper = Array.from(
            container.querySelectorAll('button > div'),
        ).find((d) => d.textContent === 'Command');
        expect(labelWrapper).toBeTruthy();
        expect(labelWrapper!.className).toMatch(/text-left/);
        expect(labelWrapper!.className).toMatch(/flex-1/);
    });

    test('icon-only button (no content): no balance ghost', () => {
        const { container } = render(
            <Button icon={<Dot />} aria-label="Settings" />,
        );
        expect(container.querySelector('[data-icon-balance-ghost]')).toBeNull();
        expect(container.querySelector('[data-right-balance-ghost]')).toBeNull();
    });

    test('icon + right together: neither single-sided ghost fires (natural flow)', () => {
        const { container } = render(
            <Button icon={<Dot />} right={<Dot />}>Both</Button>,
        );
        // Both ghosts suppress when both sides already carry weight —
        // documented edge case (icon and right are assumed to roughly
        // balance each other; double-ghosting would over-correct).
        expect(container.querySelector('[data-icon-balance-ghost]')).toBeNull();
        expect(container.querySelector('[data-right-balance-ghost]')).toBeNull();
    });
});
