"use client";

/**
 * Epic 55 — shared <FieldGroup> layout primitive.
 *
 * Stacks multiple `<FormField>`s (or plain controls) with consistent
 * vertical rhythm and an optional section header. Replaces the ad-hoc
 * `<div className="space-y-4">` / `<div className="grid grid-cols-2 gap-4">`
 * patterns that every modal/page currently rolls its own.
 *
 * Usage:
 *
 *     <FieldGroup title="Contact" description="How we'll reach you.">
 *         <FormField label="Email"><Input /></FormField>
 *         <FormField label="Phone"><Input /></FormField>
 *     </FieldGroup>
 *
 *     <FieldGroup columns={2}>
 *         <FormField label="First name"><Input /></FormField>
 *         <FormField label="Last name"><Input /></FormField>
 *     </FieldGroup>
 *
 * Accessibility:
 *   - When `title` is present, the wrapper renders with `role="group"`
 *     and `aria-labelledby` pointing at the heading so assistive tech
 *     announces "Contact group, Email edit, …" instead of flattening
 *     the hierarchy.
 */

import { cn } from "@dub/utils";
import * as React from "react";
import { FormDescription } from "./form-description";

export interface FieldGroupProps
    extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
    /** Optional section heading. Rendered as an h3 by default. */
    title?: React.ReactNode;
    /** Optional muted description below the title. */
    description?: React.ReactNode;
    /**
     * Controls the grid layout. Defaults to a single-column vertical
     * stack (the common case for CRUD modals).
     */
    columns?: 1 | 2 | 3;
    /** Vertical gap between fields. Default: `md` (1rem / gap-4). */
    gap?: "sm" | "md" | "lg";
    /** Override the heading element. Defaults to `h3`. */
    titleAs?: "h2" | "h3" | "h4";
}

const gapClass = {
    sm: "gap-2",
    md: "gap-4",
    lg: "gap-6",
} as const;

const columnsClass = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
} as const;

const FieldGroup = React.forwardRef<HTMLElement, FieldGroupProps>(
    (
        {
            title,
            description,
            columns = 1,
            gap = "md",
            titleAs = "h3",
            className,
            children,
            ...props
        },
        ref,
    ) => {
        const autoId = React.useId();
        const hasTitle = Boolean(title);
        const headingId = hasTitle ? `field-group-${autoId}-title` : undefined;
        const Heading = titleAs;

        return (
            <section
                ref={ref}
                data-field-group
                role={hasTitle ? "group" : undefined}
                aria-labelledby={headingId}
                className={cn("w-full", className)}
                {...props}
            >
                {hasTitle && (
                    <header className="mb-3">
                        <Heading
                            id={headingId}
                            className="text-sm font-semibold text-content-emphasis"
                        >
                            {title}
                        </Heading>
                        {description && (
                            <FormDescription className="mt-0.5">
                                {description}
                            </FormDescription>
                        )}
                    </header>
                )}
                <div
                    className={cn(
                        "grid",
                        columnsClass[columns],
                        gapClass[gap],
                    )}
                >
                    {children}
                </div>
            </section>
        );
    },
);

FieldGroup.displayName = "FieldGroup";

export { FieldGroup };
