/**
 * Pure freshness resolver. Maps a timestamp + thresholds onto a
 * green/amber/red level + age in days.
 *
 * Lives in a pure `.ts` so node-only unit tests can import it
 * without depending on JSX or the Lucide icon set.
 */

export type FreshnessLevel = 'fresh' | 'stale' | 'outdated' | 'unknown';

export interface FreshnessResult {
    level: FreshnessLevel;
    /** Age in whole days (Math.floor). `null` when timestamp is missing. */
    ageDays: number | null;
}

export interface ResolveFreshnessOptions {
    warnAfterDays?: number;
    staleAfterDays?: number;
    now?: Date | null;
}

const MS_PER_DAY = 86_400_000;

export function resolveFreshness(
    lastRefreshedAt: string | Date | null | undefined,
    options: ResolveFreshnessOptions = {},
): FreshnessResult {
    const { warnAfterDays = 30, staleAfterDays = 90, now } = options;

    if (lastRefreshedAt == null) {
        return { level: 'unknown', ageDays: null };
    }
    const ts =
        lastRefreshedAt instanceof Date
            ? lastRefreshedAt
            : new Date(lastRefreshedAt);
    if (Number.isNaN(ts.getTime())) {
        return { level: 'unknown', ageDays: null };
    }

    const reference = now ?? new Date();
    // Future-dated timestamps (clock skew, scheduled-update edge
    // cases) shouldn't read as "outdated" — clamp the age to 0 so
    // they fall in the green band.
    const ageMs = Math.max(0, reference.getTime() - ts.getTime());
    const ageDays = Math.floor(ageMs / MS_PER_DAY);

    let level: FreshnessLevel;
    if (ageDays < warnAfterDays) level = 'fresh';
    else if (ageDays < staleAfterDays) level = 'stale';
    else level = 'outdated';

    return { level, ageDays };
}
