/**
 * Epic 46.4 — pure helpers for the framework builder's reorder
 * persistence path.
 *
 * Two operations are needed:
 *
 *   1. **Intra-section requirement reorder** — drop a requirement
 *      somewhere else within the SAME section. Renumber that
 *      section's requirements to a contiguous block starting at
 *      the section's existing base index.
 *
 *   2. **Section reorder** — drop a section above/below another
 *      section. Renumber every requirement globally so the new
 *      section order is realised in `sortOrder`. Brute-force but
 *      correct: section ordering depends on `MIN(sortOrder)` per
 *      section in `buildFrameworkTree`, so the only way to
 *      reorder sections without changing global rows is to write
 *      a new sortOrder for every requirement.
 *
 * Pure / deterministic — same input always produces the same
 * persisted overlay. The endpoint handler just calls these
 * helpers and writes the result via UPSERT.
 *
 * The output overlay is intentionally a flat
 * `{ requirementId, sortOrder }[]` so the endpoint can do a
 * single transaction with `Promise.all(map(upsert))`. The
 * frontend never builds these directly — it sends the desired
 * shape (an ordered list of section blocks) and the endpoint
 * computes the overlay.
 */

export interface OrderedSection {
    /** Stable section id (matches FrameworkTreeNode.id, with the `section:` prefix). */
    sectionId: string;
    /** Requirement ids in their new in-section order. */
    requirementIds: ReadonlyArray<string>;
}

export interface OverlayEntry {
    requirementId: string;
    sortOrder: number;
}

/**
 * Flatten an ordered list of section blocks into the sortOrder
 * overlay rows we'll persist.
 *
 * The numbering scheme uses a 1000-step gap per section
 * (section 0 → 0..999, section 1 → 1000..1999, etc.). The gap
 * lets future inserts land between two adjacent requirements
 * without renumbering — basic order-key pattern.
 *
 * Empty sections still consume a numbering block so a section
 * dragged AFTER an empty section keeps its order. The minimum
 * sortOrder per group is what `buildFrameworkTree` uses to
 * order sections, so we just need each section's first
 * requirement to fall into the right band.
 */
export function flattenOrderedSectionsToOverlay(
    sections: ReadonlyArray<OrderedSection>,
    options: { sectionStride?: number } = {},
): OverlayEntry[] {
    const stride = options.sectionStride ?? 1000;
    const out: OverlayEntry[] = [];
    sections.forEach((section, sectionIndex) => {
        const base = sectionIndex * stride;
        section.requirementIds.forEach((reqId, i) => {
            out.push({ requirementId: reqId, sortOrder: base + i });
        });
    });
    return out;
}

/**
 * Validate a reorder request against the current tree's
 * requirement ids. Returns the set of unknown ids the caller
 * should reject (the endpoint wraps the result in a 400 if
 * non-empty). Defensive guard against tampered payloads — the
 * endpoint also rejects when the count differs, so this catches
 * "client sent the wrong framework's ids".
 */
export function findUnknownRequirementIds(
    requested: ReadonlyArray<OrderedSection>,
    knownIds: ReadonlySet<string>,
): string[] {
    const out: string[] = [];
    for (const section of requested) {
        for (const id of section.requirementIds) {
            if (!knownIds.has(id)) out.push(id);
        }
    }
    return out;
}

/**
 * Apply per-tenant `sortOrder` overrides to a flat requirements
 * list, returning a new array sorted by the merged sortOrder.
 *
 * Used by the tree usecase BEFORE handing requirements to
 * `buildFrameworkTree`. Pulled out as a pure helper so the
 * "override wins, fall back to global" rule has a single place.
 */
export function applySortOrderOverlay<
    T extends { id: string; sortOrder: number },
>(
    requirements: ReadonlyArray<T>,
    overlay: ReadonlyMap<string, number>,
): T[] {
    return [...requirements]
        .map((r) => ({ ...r, sortOrder: overlay.get(r.id) ?? r.sortOrder }))
        .sort((a, b) => a.sortOrder - b.sortOrder);
}
