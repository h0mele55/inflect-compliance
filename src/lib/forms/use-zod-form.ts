"use client";

/**
 * Epic 55 hardening — shared Zod form hook.
 *
 * Bridges server-side Zod schemas (already defined in
 * `src/lib/schemas/` + `src/app-layer/schemas/`) to client forms so
 * the UI stops reinventing validation per modal. Kept intentionally
 * small — no react-hook-form style registry, no resolver ecosystem
 * coupling. The house pattern is:
 *
 *     const form = useZodForm({
 *         schema: CreateControlSchema.pick({ name: true, description: true, category: true }),
 *         defaults: { name: '', description: '', category: '' },
 *     });
 *
 *     <Input
 *         id="name"
 *         value={form.values.name}
 *         onChange={(e) => form.setField('name', e.target.value)}
 *         onBlur={() => form.touchField('name')}
 *         invalid={form.isFieldInvalid('name')}
 *     />
 *     {form.fieldError('name') && <FormError>{form.fieldError('name')}</FormError>}
 *
 *     <button disabled={!form.canSubmit} onClick={async () => {
 *         const result = form.validate();
 *         if (!result.success) return;
 *         await submit(result.data);
 *     }}>Save</button>
 *
 * Design decisions:
 *   - Untouched fields don't show errors. Errors appear on blur or on
 *     an attempted submit. This matches the house UX in every migrated
 *     modal today.
 *   - `validate()` returns the Zod parse result; callers decide what to
 *     do with success vs error (fire mutation, focus first invalid,
 *     etc.). The hook doesn't own the network call — the observability
 *     + mutation hooks already in place do.
 *   - `canSubmit` is a convenience — true when every required field is
 *     non-empty AND no touched field has an error. Callers can always
 *     override with their own gate (e.g. additional cross-field rule).
 */

import * as React from "react";
import type { ZodTypeAny, z } from "zod";

export type FieldErrors<TValues> = Partial<Record<keyof TValues, string>>;

export interface UseZodFormOptions<TSchema extends ZodTypeAny> {
    schema: TSchema;
    defaults: z.input<TSchema>;
    /**
     * Optional external error override — e.g. server-side validation
     * returned a field-level error that the client schema doesn't know
     * about. Merged on top of the client-side errors so server errors
     * take precedence.
     */
    serverErrors?: FieldErrors<z.input<TSchema>>;
}

export interface UseZodFormReturn<TValues> {
    values: TValues;
    setField: <K extends keyof TValues>(key: K, value: TValues[K]) => void;
    setValues: (next: TValues | ((prev: TValues) => TValues)) => void;
    touchField: (key: keyof TValues) => void;
    touched: Partial<Record<keyof TValues, true>>;
    errors: FieldErrors<TValues>;
    fieldError: (key: keyof TValues) => string | undefined;
    isFieldInvalid: (key: keyof TValues) => boolean;
    reset: (next?: TValues) => void;
    /**
     * Marks every field as touched (so errors surface) and runs a
     * parse. Returns the Zod parse result; callers inspect `.success`.
     */
    validate: () => ValidationResult<TValues>;
    /** True when no errors exist on any field. Cheaper than validate(). */
    canSubmit: boolean;
}

type ValidationResult<TValues> =
    | { success: true; data: TValues }
    | { success: false; errors: FieldErrors<TValues> };

export function useZodForm<TSchema extends ZodTypeAny>(
    options: UseZodFormOptions<TSchema>,
): UseZodFormReturn<z.input<TSchema>> {
    type TValues = z.input<TSchema>;

    const { schema, defaults, serverErrors } = options;

    const [values, setValuesState] = React.useState<TValues>(defaults);
    const [touched, setTouched] = React.useState<
        Partial<Record<keyof TValues, true>>
    >({});
    const [errors, setErrors] = React.useState<FieldErrors<TValues>>({});

    // Re-run validation whenever values change; only expose errors for
    // touched fields (typical "don't yell before the user leaves the
    // field" UX).
    React.useEffect(() => {
        const parse = schema.safeParse(values);
        if (parse.success) {
            setErrors({});
            return;
        }
        const next: FieldErrors<TValues> = {};
        for (const issue of parse.error.issues) {
            const key = issue.path[0] as keyof TValues | undefined;
            if (key !== undefined && next[key] === undefined) {
                next[key] = issue.message;
            }
        }
        setErrors(next);
    }, [values, schema]);

    const effectiveErrors = React.useMemo<FieldErrors<TValues>>(
        () => ({ ...errors, ...(serverErrors ?? {}) }),
        [errors, serverErrors],
    );

    const setField = React.useCallback(
        <K extends keyof TValues>(key: K, value: TValues[K]) => {
            setValuesState((prev) => ({ ...prev, [key]: value }));
        },
        [],
    );

    const setValues = React.useCallback(
        (next: TValues | ((prev: TValues) => TValues)) => {
            setValuesState(next);
        },
        [],
    );

    const touchField = React.useCallback((key: keyof TValues) => {
        setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
    }, []);

    const fieldError = React.useCallback(
        (key: keyof TValues) =>
            touched[key] ? effectiveErrors[key] : serverErrors?.[key],
        [touched, effectiveErrors, serverErrors],
    );

    const isFieldInvalid = React.useCallback(
        (key: keyof TValues) => Boolean(fieldError(key)),
        [fieldError],
    );

    const reset = React.useCallback(
        (next?: TValues) => {
            setValuesState(next ?? defaults);
            setTouched({});
            setErrors({});
        },
        [defaults],
    );

    const canSubmit = React.useMemo(() => {
        // canSubmit uses the raw errors (not filtered by touched) so a
        // submit button disables itself correctly even before the user
        // has interacted.
        const keys = Object.keys(effectiveErrors) as (keyof TValues)[];
        return keys.every((k) => !effectiveErrors[k]);
    }, [effectiveErrors]);

    const validate = React.useCallback((): ValidationResult<TValues> => {
        // Mark everything touched so errors surface on the next render.
        setTouched(() => {
            const next: Partial<Record<keyof TValues, true>> = {};
            for (const key of Object.keys(values)) {
                next[key as keyof TValues] = true;
            }
            return next;
        });
        const parse = schema.safeParse(values);
        if (parse.success) {
            return { success: true, data: parse.data as TValues };
        }
        const nextErrors: FieldErrors<TValues> = {};
        for (const issue of parse.error.issues) {
            const key = issue.path[0] as keyof TValues | undefined;
            if (key !== undefined && nextErrors[key] === undefined) {
                nextErrors[key] = issue.message;
            }
        }
        setErrors(nextErrors);
        return { success: false, errors: nextErrors };
    }, [schema, values]);

    return {
        values,
        setField,
        setValues,
        touchField,
        touched,
        errors: effectiveErrors,
        fieldError,
        isFieldInvalid,
        reset,
        validate,
        canSubmit,
    };
}
