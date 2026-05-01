/**
 * Epic 46 — pure helpers for the framework minimap.
 *
 * Pulled out of the React component so the "which section is
 * active" logic and the section-list derivation can be unit-tested
 * without DOM (no `jest-environment-jsdom` in this project).
 */

import type { FrameworkTreeNode } from './types';

// ─── Section list derivation ───────────────────────────────────────────

export interface MinimapSection {
    id: string;
    label: string;
    /** Total descendant count (used as a size hint for the minimap row). */
    descendantCount: number;
    /** Pre-computed status (from `decorateTreeWithCompliance`). */
    status: FrameworkTreeNode['complianceStatus'];
    /**
     * Per-status counts across this section's descendants, used by
     * the minimap row's mini-distribution bar.
     */
    statusCounts: FrameworkTreeNode['statusCounts'];
}

/**
 * Extract the top-level section nodes for the minimap's strip.
 *
 * Sections are the only navigation targets the minimap exposes.
 * Requirements + sub-requirements are reachable by expanding the
 * section in the tree; the minimap stays at section granularity
 * so even a 500-section framework reads as a tractable strip.
 */
export function deriveMinimapSections(
    nodes: ReadonlyArray<FrameworkTreeNode>,
): MinimapSection[] {
    return nodes
        .filter((n) => n.kind === 'section')
        .map((n) => ({
            id: n.id,
            label: n.label,
            descendantCount: n.descendantCount,
            status: n.complianceStatus,
            statusCounts: n.statusCounts,
        }));
}

// ─── Active-section selection from intersection observations ───────────

/**
 * One per-section observation snapshot: the visible-fraction
 * (0..1) and the section's vertical position in the scroll
 * container. Provided by an IntersectionObserver in the React
 * component.
 */
export interface SectionVisibility {
    id: string;
    /**
     * Fraction of the section row visible in the viewport (0..1).
     * 0 means fully scrolled out of view; 1 means fully visible.
     */
    intersectionRatio: number;
    /**
     * `boundingClientRect.top` relative to the scroll container.
     * Used as a tiebreaker when multiple sections are equally
     * visible — the one closest to the top wins (matches what a
     * reader would consider "the section I'm currently looking at").
     */
    topOffset: number;
}

/**
 * Decide which section is the "current" one given a snapshot of
 * everyone's intersection state.
 *
 * Tie-break rules (in order):
 *   1. Highest `intersectionRatio` (most visible).
 *   2. Smallest non-negative `topOffset` (closest to the viewport
 *      top from inside the viewport).
 *   3. Highest `topOffset` for sections above the viewport (the
 *      one we just scrolled past — keeps the active marker from
 *      flickering up to the very first section when we're between
 *      sections).
 *
 * Returns null when no sections are visible at all (e.g. before
 * the first paint or with an empty list).
 */
export function pickActiveSection(
    visibilities: ReadonlyArray<SectionVisibility>,
): string | null {
    if (visibilities.length === 0) return null;

    const visible = visibilities.filter((v) => v.intersectionRatio > 0);
    if (visible.length > 0) {
        let best = visible[0];
        for (const v of visible) {
            if (v.intersectionRatio > best.intersectionRatio) {
                best = v;
                continue;
            }
            if (v.intersectionRatio === best.intersectionRatio) {
                // Tiebreaker: closer to top wins, but only counting
                // non-negative topOffsets (above-viewport sections
                // are dominated by visible ones above).
                const bestAbove = best.topOffset < 0;
                const vAbove = v.topOffset < 0;
                if (bestAbove && !vAbove) {
                    best = v;
                } else if (!bestAbove && !vAbove && v.topOffset < best.topOffset) {
                    best = v;
                }
            }
        }
        return best.id;
    }

    // Nothing visible — pick the section we just scrolled past
    // (largest non-positive topOffset). Falls back to the first
    // section if everything is below the viewport.
    let best = visibilities[0];
    for (const v of visibilities) {
        if (v.topOffset <= 0 && (best.topOffset > 0 || v.topOffset > best.topOffset)) {
            best = v;
        }
    }
    return best.id;
}
