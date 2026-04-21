/**
 * Tooltip stub for the jsdom test project.
 *
 * The shared `<Tooltip>` primitive wraps Radix Tooltip, which in turn
 * requires a `TooltipProvider` in the tree and emits portalised content.
 * Most render tests that transitively touch Tooltip (through Button /
 * Switch / StatusBadge) only care that children render — they never open
 * the tooltip. A pass-through stub keeps those tests decoupled from
 * Radix's portal lifecycle.
 *
 * The dedicated tooltip test at `tests/rendered/tooltip.test.tsx` imports
 * the real primitive via a path the moduleNameMapper doesn't match
 * (`@/components/ui/tooltip.tsx` with the explicit extension), so the
 * mock below stays in place for everyone else.
 */

import * as React from 'react';

type ChildrenProps = { children?: React.ReactNode };

export function TooltipProvider({ children }: ChildrenProps) {
    return <>{children}</>;
}

export function Tooltip({ children }: ChildrenProps & Record<string, unknown>) {
    return <>{children}</>;
}

export function InfoTooltip(
    props: { iconClassName?: string; 'aria-label'?: string } & Record<string, unknown>,
) {
    // Render a focusable button so render tests can verify the hint
    // surface is wired up correctly (aria-label, label + hint layout).
    // Tooltip open-on-focus behaviour is covered by the real primitive
    // in `tooltip.test.tsx` and does not need to be exercised here.
    const label = (props['aria-label'] as string | undefined) ?? 'More information';
    return (
        <button
            type="button"
            aria-label={label}
            data-testid="info-tooltip-trigger"
        />
    );
}

export function DynamicTooltipWrapper({ children }: ChildrenProps) {
    return <>{children}</>;
}
