/**
 * Epic 47.2 — pure search + adjacency helpers for the graph
 * explorer.
 *
 * Pulled out of the React component so the matching rules + the
 * adjacency walk are unit-testable without a DOM (the project
 * doesn't ship `jest-environment-jsdom`).
 *
 * Two-tier highlight strategy:
 *
 *   - **MATCHED** — the node's label, secondary text, badge, or
 *     code field contains the search term (case-insensitive).
 *   - **ADJACENT** — the node is one hop away from a matched
 *     node along any edge (direction ignored).
 *   - **DIMMED** — neither matched nor adjacent. The renderer
 *     drops opacity so the relevant subgraph stands out.
 *
 * Adjacency is unweighted by relation (a control adjacent to a
 * risk via `mitigates` reads exactly the same as a control
 * adjacent to an asset via `protects`). The MVP needs subgraph
 * focus, not relation-weighted ranking; relation weighting is a
 * later enhancement that fits cleanly into this contract.
 */

import type { TraceabilityEdge, TraceabilityNode } from './types';

// ─── Highlight result ──────────────────────────────────────────────────

/**
 * Returned by `computeSearchHighlight`. Three disjoint Sets:
 *
 *   - `matched`  — every node id whose searchable text contains
 *                  the query
 *   - `adjacent` — every node id one hop away from a matched node
 *                  (excludes matched ones to keep the Sets
 *                  disjoint)
 *   - `dimmed`   — every other node id
 *
 * `hasQuery` lets the renderer distinguish "search active, no
 * matches" from "no search active" (different visual treatments).
 */
export interface SearchHighlight {
    matched: ReadonlySet<string>;
    adjacent: ReadonlySet<string>;
    dimmed: ReadonlySet<string>;
    hasQuery: boolean;
    matchCount: number;
}

// ─── Match predicate ───────────────────────────────────────────────────

/**
 * Lowercase + trim once. The renderer calls this once per render;
 * the per-node match check is a cheap `String.includes`.
 */
function normalize(query: string): string {
    return query.trim().toLowerCase();
}

function matchesNode(
    node: TraceabilityNode,
    needle: string,
): boolean {
    if (!needle) return false;
    const haystacks = [
        node.label,
        node.secondary ?? '',
        node.badge ?? '',
    ];
    for (const h of haystacks) {
        if (h.toLowerCase().includes(needle)) return true;
    }
    return false;
}

// ─── Highlight compute ─────────────────────────────────────────────────

/**
 * Build the highlight Sets given the current graph + search term.
 *
 * Returns the EMPTY-query shape (every node dimmed: false,
 * matched: false) when the query is blank — caller renders the
 * full graph with no special treatment.
 */
export function computeSearchHighlight(
    nodes: ReadonlyArray<TraceabilityNode>,
    edges: ReadonlyArray<TraceabilityEdge>,
    query: string,
): SearchHighlight {
    const needle = normalize(query);
    if (!needle) {
        return {
            matched: new Set(),
            adjacent: new Set(),
            dimmed: new Set(),
            hasQuery: false,
            matchCount: 0,
        };
    }

    const matched = new Set<string>();
    for (const n of nodes) {
        if (matchesNode(n, needle)) matched.add(n.id);
    }

    // BFS one hop along edges (direction-agnostic).
    const adjacent = new Set<string>();
    if (matched.size > 0) {
        for (const e of edges) {
            if (matched.has(e.source) && !matched.has(e.target)) {
                adjacent.add(e.target);
            }
            if (matched.has(e.target) && !matched.has(e.source)) {
                adjacent.add(e.source);
            }
        }
    }

    const dimmed = new Set<string>();
    for (const n of nodes) {
        if (!matched.has(n.id) && !adjacent.has(n.id)) dimmed.add(n.id);
    }

    return {
        matched,
        adjacent,
        dimmed,
        hasQuery: true,
        matchCount: matched.size,
    };
}

// ─── Edge dimming ──────────────────────────────────────────────────────

/**
 * An edge is dimmed iff EITHER endpoint is dimmed. Used to fade
 * the lines connecting irrelevant subgraphs so the matched
 * cluster reads cleanly.
 */
export function isEdgeDimmed(
    edge: TraceabilityEdge,
    dimmed: ReadonlySet<string>,
): boolean {
    return dimmed.has(edge.source) || dimmed.has(edge.target);
}
