/**
 * PR-5 — list-page SWR backfill cap.
 *
 * The unbounded `GET /api/t/[slug]/<entity>` path that backs every
 * SWR list-page read used to return all rows. PR-1/PR-2 added an
 * SSR cap (100 rows) for the initial render, but the SWR backfill
 * still loaded the whole tenant's data set every time the page
 * mounted — fine for tenants with hundreds of rows, dangerous as
 * tenants accumulate thousands.
 *
 * This module is the canonical entry point for that cap. The API
 * route handler asks the repo for `LIST_BACKFILL_CAP + 1` rows; if
 * the result exceeds the cap, the helper slices to the cap and sets
 * `truncated: true`. The Client renders a banner when truncated to
 * tell the user "you have too many results to fully load — refine
 * filters to see all of them" (instead of silently lying about
 * completeness).
 *
 * The 5000-row choice is calibrated for the largest pilot tenants.
 * It's well above the row count any reasonable list view can usefully
 * render at once (the table virtualises after 1000 rows per Epic 68
 * anyway), and gives a comfortable buffer for "I want to scroll-skim
 * the whole population" use cases without ever returning a payload
 * that would crash a phone browser.
 */

export const LIST_BACKFILL_CAP = 5000;

export interface CappedList<T> {
    rows: T[];
    truncated: boolean;
}

/**
 * Clamp a list of rows to the backfill cap and report whether the
 * cap fired. Callers in API route handlers should pass `take: cap+1`
 * to the underlying `findMany` and then this helper to the result —
 * the cap+1 sentinel is what makes "exactly cap rows" distinguishable
 * from "more than cap rows".
 */
export function applyBackfillCap<T>(rows: T[]): CappedList<T> {
    return rows.length > LIST_BACKFILL_CAP
        ? { rows: rows.slice(0, LIST_BACKFILL_CAP), truncated: true }
        : { rows, truncated: false };
}
