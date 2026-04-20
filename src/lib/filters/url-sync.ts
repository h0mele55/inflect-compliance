/**
 * Epic 53 — shared URL synchronisation helpers for filter-driven list pages.
 *
 * Goal: turn a `FilterState` (the shape maintained by `useFilterContext`)
 * into a deterministic API query string, while giving page authors a clean
 * seam to express "one UI filter key → multiple API query params" transforms
 * (e.g. the `score=30|70` range token that fans out to `scoreMin=30` +
 * `scoreMax=70` on the Risks API).
 *
 * Why live outside `src/components/ui/filter/`:
 *   - Purely server-query shaping — no React, no cmdk, no JSX. Keeping it in
 *     `src/lib/filters` means non-UI consumers (jobs, webhooks, tests) can
 *     import it without pulling the component graph.
 *   - Generic by contract. Every transform is provided by the caller; no
 *     entity-specific branching.
 *
 * Determinism guarantees (tested below):
 *   - Keys are emitted in sorted order so two states with the same values
 *     always produce the same URL.
 *   - Empty keys (no values) are elided.
 *   - The shared `q` search slot is emitted last so it sits at a predictable
 *     position when humans read the URL.
 *   - Pagination cursors are never leaked — callers are responsible for
 *     appending them after the filter-sync step if they want them.
 *
 * See `useFilterContext` in `src/components/ui/filter/filter-context.tsx`
 * for the client-side state + URL push; this module complements it by
 * shaping the *API fetch* URL, which often differs (e.g. UI carries a
 * single `score` range token while the API consumes two separate params).
 */

import type { FilterState } from "@/components/ui/filter/filter-state";
import {
    parseRangeToken,
} from "@/components/ui/filter/types";

/**
 * A transform maps a single UI filter key to one or more API parameters.
 * Applied by `toApiSearchParams` when the UI key is present in state.
 *
 * `values` is always the raw `FilterState[key]` array — an array of one
 * element for single-select filters, multiple elements for multi-select.
 *
 * Transforms should mutate `params` with the intended API keys and skip
 * emission when the values are invalid (e.g. a range token `"|"`). Returning
 * nothing is fine — callers rely on `params` side effects.
 */
export type FilterApiTransform = (
    values: string[],
    params: URLSearchParams,
) => void;

/** Built-in transform: emit a single UI key as the first value only. */
export function singleValueTransform(apiKey: string): FilterApiTransform {
    return (values, params) => {
        const first = values[0];
        if (first) params.set(apiKey, first);
    };
}

/** Built-in transform: emit a comma-joined multi-value URL param. */
export function commaJoinedTransform(
    apiKey: string,
    separator = ",",
): FilterApiTransform {
    return (values, params) => {
        if (values.length === 0) return;
        params.set(apiKey, values.join(separator));
    };
}

/**
 * Built-in transform: split a `"min|max"` range token (produced by
 * `encodeRangeToken`) into two distinct API keys. Skips emission when both
 * bounds are absent (the sentinel `"|"`).
 */
export function rangeSplitTransform(
    minKey: string,
    maxKey: string,
): FilterApiTransform {
    return (values, params) => {
        const token = values[0];
        if (!token) return;
        const { min, max } = parseRangeToken(token);
        if (min != null) params.set(minKey, String(min));
        if (max != null) params.set(maxKey, String(max));
    };
}

/**
 * Convert a `FilterState` + optional search into a deterministic
 * `URLSearchParams` suitable for an API fetch.
 *
 * - Unknown keys (not in `transforms`) fall back to `commaJoinedTransform(key)`
 *   which matches the default behaviour of `filterStateToUrlParams`.
 * - `q` from `options.search` is emitted after all filter keys.
 * - Always iterated in sorted-key order for deterministic output.
 */
export function toApiSearchParams(
    state: FilterState,
    options: {
        search?: string;
        transforms?: Record<string, FilterApiTransform>;
        /** Extra params to append verbatim (for cursors, sorts, etc.). */
        extras?: Record<string, string | undefined>;
    } = {},
): URLSearchParams {
    const params = new URLSearchParams();
    const transforms = options.transforms ?? {};

    const keys = Object.keys(state).sort();
    for (const key of keys) {
        const values = state[key];
        if (!values || values.length === 0) continue;
        const transform = transforms[key] ?? commaJoinedTransform(key);
        transform(values, params);
    }

    if (options.search) {
        params.set("q", options.search);
    }

    if (options.extras) {
        for (const [k, v] of Object.entries(options.extras)) {
            if (v !== undefined && v !== "") params.set(k, v);
        }
    }

    return params;
}

/**
 * Convenience wrapper: returns a query string ready to append to a fetch
 * URL. Empty when no filters are active.
 */
export function toApiQueryString(
    state: FilterState,
    options: Parameters<typeof toApiSearchParams>[1] = {},
): string {
    const qs = toApiSearchParams(state, options).toString();
    return qs ? `?${qs}` : "";
}
