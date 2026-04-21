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

// ─── Compact + range formatters (Epic 58) ────────────────────────────────────

const DATE_COMPACT_FMT = new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
});

const MONTH_FMT = new Intl.DateTimeFormat(LOCALE, {
    month: 'short',
    timeZone: 'UTC',
});

/**
 * Compact day + month, no year — "16 Apr". Use for chart axes,
 * mini-calendars, and anywhere the calendar context already implies
 * the year. Returns the fallback (default `'—'`) for nullish input.
 */
export function formatDateCompact(
    value: string | Date | null | undefined,
    fallback = '—',
): string {
    const d = toDate(value);
    return d ? DATE_COMPACT_FMT.format(d) : fallback;
}

/**
 * Canonical date-range formatter. Adapts to the kind of range:
 *
 *   { from: 16 Apr, to: 16 Apr }       →  "16 Apr 2026"           (single day)
 *   { from: 16 Apr, to: 30 Apr }       →  "16 – 30 Apr 2026"      (same month)
 *   { from: 16 Apr, to: 30 Jun }       →  "16 Apr – 30 Jun 2026"  (same year)
 *   { from: 16 Apr 2025, to: 30 Jun }  →  "16 Apr 2025 – 30 Jun 2026"
 *   { from: 16 Apr, to: null }          →  "From 16 Apr 2026"
 *   { from: null, to: 30 Apr }          →  "Until 30 Apr 2026"
 *   { from: null, to: null }            →  fallback (default '—')
 *
 * The em-dash (U+2013) separator and the UTC calendar fields match the
 * rest of the date helpers. Use everywhere a range is surfaced in chrome
 * — picker triggers, filter pills, audit-cycle detail, reports legends.
 */
export function formatDateRange(
    from: string | Date | null | undefined,
    to: string | Date | null | undefined,
    fallback = '—',
): string {
    const fromD = toDate(from);
    const toD = toDate(to);

    if (!fromD && !toD) return fallback;
    if (fromD && !toD) return `From ${DATE_FMT.format(fromD)}`;
    if (!fromD && toD) return `Until ${DATE_FMT.format(toD)}`;

    // TS narrowing — both non-null here.
    const a = fromD as Date;
    const b = toD as Date;

    const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
    const sameMonth = sameYear && a.getUTCMonth() === b.getUTCMonth();
    const sameDay = sameMonth && a.getUTCDate() === b.getUTCDate();

    if (sameDay) return DATE_FMT.format(a);

    if (sameMonth) {
        // "16 – 30 Apr 2026"
        return `${a.getUTCDate()} – ${DATE_FMT.format(b)}`;
    }

    if (sameYear) {
        // "16 Apr – 30 Jun 2026": drop the year on the left endpoint.
        const leftNoYear = `${a.getUTCDate()} ${MONTH_FMT.format(a)}`;
        return `${leftNoYear} – ${DATE_FMT.format(b)}`;
    }

    // Different years — both endpoints carry their year.
    return `${DATE_FMT.format(a)} – ${DATE_FMT.format(b)}`;
}
