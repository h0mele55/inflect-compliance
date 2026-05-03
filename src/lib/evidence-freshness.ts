/**
 * Epic 62 — pure helper for the "all evidence current" milestone.
 *
 * Lives in `src/lib/` so node-only unit tests can exercise the
 * decision matrix without React or jsdom. The evidence list page
 * (and any future widget that wants to surface the same state)
 * imports from here so the milestone definition stays centralised.
 *
 * "All current" means, against the **unfiltered** active set:
 *
 *   1. At least one row exists (an empty workspace isn't a milestone).
 *   2. No row is `expiredAt` (the explicit "expired" flag).
 *   3. Every remaining active row reads as `fresh` per
 *      `resolveFreshness` — i.e. zero stale and zero outdated.
 *
 * Archived / soft-deleted rows are ignored — they're not part of the
 * active workspace state.
 *
 * Filtered views (search, status, tab=expiring, etc.) must be
 * excluded by the caller before invoking this helper. Surfacing the
 * milestone on a coincidentally-empty filter result would be a false
 * positive — see `EvidenceClient` for how the call site gates this.
 */

import { resolveFreshness } from '@/components/ui/freshness';

export interface EvidenceFreshnessRow {
    /** Truthy when the row has been hard-expired by retention policy. */
    expiredAt?: string | Date | null;
    /** Truthy when the row was archived (excluded from "active"). */
    isArchived?: boolean | null;
    /** Truthy when the row was soft-deleted (excluded from "active"). */
    deletedAt?: string | Date | null;
    /**
     * Last meaningful update — same field the page renders into
     * `<FreshnessBadge>`. The helper falls back to `dateCollected`
     * when `updatedAt` is missing, mirroring the call-site choice.
     */
    updatedAt?: string | Date | null;
    /** Original collection date — fallback for the freshness anchor. */
    dateCollected?: string | Date | null;
}

export interface IsAllEvidenceCurrentOptions {
    /**
     * Reference "now" for freshness resolution. Pass the page's
     * hydrated-now value so SSR + first-client render agree (see
     * `useHydratedNow`). Defaults to `new Date()` for callers
     * outside the page lifecycle.
     */
    now?: Date | null;
    /**
     * Override the freshness thresholds. Defaults match
     * `resolveFreshness`'s 30 / 90 day defaults.
     */
    warnAfterDays?: number;
    staleAfterDays?: number;
}

/**
 * True when the workspace has at least one piece of evidence and
 * every active row is fresh. False when empty, when any row is
 * expired, or when any active row is stale / outdated.
 */
export function isAllEvidenceCurrent(
    rows: ReadonlyArray<EvidenceFreshnessRow>,
    options: IsAllEvidenceCurrentOptions = {},
): boolean {
    const { now, warnAfterDays, staleAfterDays } = options;

    // Filter to the active subset — archived / deleted rows aren't
    // part of the live workspace.
    const active = rows.filter(
        (r) => !r.isArchived && !r.deletedAt,
    );

    // Empty workspace isn't a milestone — celebrating "you have zero
    // overdue items because you have zero items" feels hollow.
    if (active.length === 0) return false;

    for (const row of active) {
        // Hard-expired wins outright — even a brand-new updatedAt
        // doesn't rescue a row whose retention has lapsed.
        if (row.expiredAt) return false;

        const anchor = row.updatedAt ?? row.dateCollected ?? null;
        const { level } = resolveFreshness(anchor, {
            now: now ?? null,
            warnAfterDays,
            staleAfterDays,
        });
        // Anything other than fresh disqualifies. `unknown` (no
        // anchor) counts as not-current — we can't claim
        // "everything is fresh" if we can't see an age for some.
        if (level !== 'fresh') return false;
    }

    return true;
}
