/**
 * UI Tokens — single source of truth for pill sizing.
 *
 * Buttons (.btn) and FilterToolbar's filter pills share these tokens.
 * CSS implementation is in globals.css, this file provides the JS-side
 * constants for components that need to compose classNames.
 *
 * ┌──────────┬──────────┬──────────────┬──────────────┬──────────┬─────────┐
 * │ Size     │ CSS class│ Height (≈)   │ Padding      │ Font     │ Icon px │
 * ├──────────┼──────────┼──────────────┼──────────────┼──────────┼─────────┤
 * │ xs       │ btn-xs   │ 28px         │ px-2.5 py-1  │ 11px     │ 12      │
 * │ sm       │ btn-sm   │ 32px         │ px-3 py-1.5  │ 12px     │ 14      │
 * │ default  │ btn      │ 34px         │ px-3.5 py-1.5│ 12px     │ 14      │
 * │ lg       │ btn-lg   │ 42px         │ px-5 py-2.5  │ 14px     │ 16      │
 * └──────────┴──────────┴──────────────┴──────────────┴──────────┴─────────┘
 */

// ─── Size tokens ───

export type ButtonSize = 'xs' | 'sm' | 'default' | 'lg';

export const BUTTON_SIZE_CLASSES: Record<ButtonSize, string> = {
    xs: 'btn-xs',
    sm: 'btn-sm',
    default: '',       // base .btn is the default
    lg: 'btn-lg',
};

export const BUTTON_ICON_SIZE: Record<ButtonSize, number> = {
    xs: 12,
    sm: 14,
    default: 14,
    lg: 16,
};

// ─── Variant tokens ───

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';

export const BUTTON_VARIANT_CLASSES: Record<ButtonVariant, string> = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger: 'btn-danger',
    success: 'btn-success',
    ghost: 'btn-ghost',
};

// ─── Composed ───

/**
 * Build a composed btn className from variant + size.
 *
 * Example:
 *   btnClass('primary')         → 'btn btn-primary'
 *   btnClass('secondary', 'sm') → 'btn btn-sm btn-secondary'
 *   btnClass('ghost', 'lg')     → 'btn btn-lg btn-ghost'
 */
export function btnClass(variant: ButtonVariant, size: ButtonSize = 'default'): string {
    const parts = ['btn'];
    const sizeClass = BUTTON_SIZE_CLASSES[size];
    if (sizeClass) parts.push(sizeClass);
    parts.push(BUTTON_VARIANT_CLASSES[variant]);
    return parts.join(' ');
}

// ─── Icon-only button sizing ───

export type IconButtonSize = 'sm' | 'md';

export const ICON_BUTTON_SIZE: Record<IconButtonSize, number> = {
    sm: 14,
    md: 16,
};

export const ICON_BUTTON_CLASSES: Record<IconButtonSize, string> = {
    sm: 'icon-btn icon-btn-sm',
    md: 'icon-btn',
};
