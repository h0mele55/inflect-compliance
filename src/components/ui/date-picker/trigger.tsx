/**
 * Epic 58 — shared date-picker Trigger.
 *
 * Token-backed button that opens a date picker popover or sheet.
 * Visually consistent with the filter-select trigger shipped in
 * Epic 57 so every list-page toolbar reads with the same vocabulary
 * — calendar icon on the left, displayed value (or placeholder)
 * in the middle, chevron on the right.
 *
 * Composition:
 *   - Fully forwards its ref and props, so Radix Popover and Vaul
 *     Drawer's `asChild` trigger pattern both work — the wrapper
 *     clones this button and attaches `data-state`,
 *     `aria-expanded`, `aria-haspopup`, `onClick`, and the anchor
 *     ref in one go.
 *   - `placeholder` renders in `text-content-subtle` whenever no
 *     `children` value is supplied. Callers pass the formatted
 *     selection (via `formatDate`/`formatDateRange`) as `children`.
 *
 * Token states:
 *   - Default: `bg-bg-default` surface, `border-border-default` edge,
 *     `text-content-emphasis` value.
 *   - Open (`data-state="open"`): `border-border-emphasis` +
 *     `ring-4 ring-ring` — identical to filter-select's emphasized
 *     focus ring.
 *   - Error (`hasError`): red border + ring drawn from the
 *     `border-error` / `ring-error` tokens, with aria-invalid so
 *     form validators pick it up.
 *   - Disabled: muted surface, no pointer events.
 */

import { cn } from '@dub/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react';
import { forwardRef, type ComponentProps } from 'react';

const triggerStyles = cva(
    [
        'group peer flex h-10 appearance-none items-center gap-x-2 truncate rounded-lg border px-3 text-sm outline-none',
        'transition-[color,border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none',
        'border-border-default bg-bg-default text-content-emphasis',
        'cursor-pointer disabled:cursor-not-allowed',
        'focus-visible:border-border-emphasis focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-default',
        'data-[state=open]:border-border-emphasis data-[state=open]:ring-4 data-[state=open]:ring-ring',
        'active:scale-[0.99] motion-reduce:active:scale-100',
        'disabled:bg-bg-muted disabled:text-content-subtle disabled:border-border-subtle',
    ],
    {
        variants: {
            hasError: {
                true: 'border-border-error ring-2 ring-border-error data-[state=open]:border-border-error data-[state=open]:ring-border-error',
            },
        },
    },
);

export interface TriggerProps
    extends ComponentProps<'button'>,
        VariantProps<typeof triggerStyles> {
    /** Shown in the value slot when no `children` are supplied. */
    placeholder?: string;
    /** Accessible label when there is no visible value. */
    'aria-label'?: string;
}

const Trigger = forwardRef<HTMLButtonElement, TriggerProps>(
    (
        {
            className,
            children,
            placeholder,
            hasError,
            disabled,
            type,
            'aria-invalid': ariaInvalid,
            ...props
        },
        forwardedRef,
    ) => {
        return (
            // eslint-disable-next-line jsx-a11y/role-supports-aria-props -- aria-invalid IS valid on <button> per WAI-ARIA 1.1 (global state); the lint rule's role-spec table is overly strict here. The form-trigger UX requires the invalid state to be announced.
            <button
                ref={forwardedRef}
                // Default to `type="button"` so the trigger never
                // accidentally submits the surrounding form.
                type={type ?? 'button'}
                className={cn(triggerStyles({ hasError }), className)}
                disabled={disabled}
                data-date-picker-trigger
                aria-invalid={hasError ? true : ariaInvalid}
                aria-haspopup="dialog"
                {...props}
            >
                <CalendarIcon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-content-muted group-hover:text-content-default"
                />
                <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left">
                    {children ? (
                        <span
                            className="text-content-emphasis"
                            data-testid="date-picker-trigger-value"
                        >
                            {children}
                        </span>
                    ) : placeholder ? (
                        <span
                            className="text-content-subtle"
                            data-testid="date-picker-trigger-placeholder"
                        >
                            {placeholder}
                        </span>
                    ) : null}
                </span>
                <ChevronDown
                    aria-hidden="true"
                    className="size-4 shrink-0 text-content-subtle transition-transform duration-100 ease-out group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                />
            </button>
        );
    },
);

Trigger.displayName = 'DatePicker.Trigger';

export { Trigger };
