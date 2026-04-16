/**
 * format-date.ts — Canonical Date Formatting Utilities
 *
 * All dates rendered in the UI MUST go through these helpers.
 *
 * WHY THIS EXISTS
 * ───────────────
 * React SSR hydration mismatches occur when the server locale differs from
 * the browser locale. For example, a Windows server configured to Bulgarian
 * renders dates as "16.04.2026 г., 11:04:57 ч." while the browser renders
 * "4/16/2026, 11:04:57 AM" — causing a React hydration warning and a flash
 * of incorrect content.
 *
 * FIX
 * ───
 * Hardcode locale to 'en-GB' and timezone to 'UTC' so server and client
 * always produce identical output regardless of OS or browser settings.
 *
 * USAGE
 * ─────
 *   import { formatDate, formatDateTime, formatDateShort } from '@/lib/format-date';
 *
 *   formatDate('2026-04-16T08:00:00Z')     // → "16 Apr 2026"
 *   formatDateTime('2026-04-16T08:00:00Z') // → "16 Apr 2026, 08:00"
 *   formatDateShort('2026-04-16T08:00:00Z') // → "16/04/2026"
 */

const LOCALE = 'en-GB';

/** Shared Intl.DateTimeFormat instances (created once, reused — fast). */
const DATE_FMT = new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
});

const DATETIME_FMT = new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
});

const DATE_SHORT_FMT = new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
});

const DATE_LONG_FMT = new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDate(value: string | Date | null | undefined): Date | null {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return isNaN(d.getTime()) ? null : d;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Format a date as "16 Apr 2026".
 * Returns the fallback string (default `'—'`) for null/invalid inputs.
 */
export function formatDate(
    value: string | Date | null | undefined,
    fallback = '—',
): string {
    const d = toDate(value);
    return d ? DATE_FMT.format(d) : fallback;
}

/**
 * Format a date + time as "16 Apr 2026, 08:00".
 * Returns the fallback string (default `'—'`) for null/invalid inputs.
 */
export function formatDateTime(
    value: string | Date | null | undefined,
    fallback = '—',
): string {
    const d = toDate(value);
    return d ? DATETIME_FMT.format(d) : fallback;
}

/**
 * Format a date as "16/04/2026".
 * Returns the fallback string (default `'—'`) for null/invalid inputs.
 */
export function formatDateShort(
    value: string | Date | null | undefined,
    fallback = '—',
): string {
    const d = toDate(value);
    return d ? DATE_SHORT_FMT.format(d) : fallback;
}

/**
 * Format a date as "16 April 2026".
 * Returns the fallback string (default `'—'`) for null/invalid inputs.
 */
export function formatDateLong(
    value: string | Date | null | undefined,
    fallback = '—',
): string {
    const d = toDate(value);
    return d ? DATE_LONG_FMT.format(d) : fallback;
}
