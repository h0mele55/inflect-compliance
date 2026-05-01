/**
 * Epic 47.2 — pure helpers behind the GraphExplorer's search.
 *
 * The component renders dimming + ring highlights from a
 * `SearchHighlight` reducer; the reducer is the unit-testable
 * heart. Covers no-query passthrough, label / secondary / badge
 * matching, adjacency BFS, and edge dimming.
 */

import {
    computeSearchHighlight,
    isEdgeDimmed,
} from '@/lib/traceability-graph/search';
import type {
    TraceabilityEdge,
    TraceabilityNode,
} from '@/lib/traceability-graph/types';

function n(id: string, partial: Partial<TraceabilityNode> = {}): TraceabilityNode {
    return {
        id,
        kind: 'control',
        label: `Node ${id}`,
        secondary: null,
        badge: null,
        href: null,
        ...partial,
    };
}

function e(id: string, source: string, target: string): TraceabilityEdge {
    return {
        id,
        source,
        target,
        relation: 'mitigates',
        qualifier: null,
    };
}

// ─── Empty-query passthrough ───────────────────────────────────────────

describe('computeSearchHighlight — empty query', () => {
    it('returns hasQuery=false and empty Sets when the query is blank', () => {
        const h = computeSearchHighlight([n('a'), n('b')], [], '');
        expect(h.hasQuery).toBe(false);
        expect(h.matchCount).toBe(0);
        expect(h.matched.size).toBe(0);
        expect(h.adjacent.size).toBe(0);
        expect(h.dimmed.size).toBe(0);
    });

    it('treats whitespace-only as empty', () => {
        const h = computeSearchHighlight([n('a')], [], '   \t  ');
        expect(h.hasQuery).toBe(false);
    });
});

// ─── Match predicates ──────────────────────────────────────────────────

describe('computeSearchHighlight — match predicates', () => {
    it('matches against label (case-insensitive)', () => {
        const h = computeSearchHighlight(
            [n('a', { label: 'Phishing exposure' }), n('b', { label: 'Other' })],
            [],
            'phish',
        );
        expect([...h.matched]).toEqual(['a']);
    });

    it('matches against secondary', () => {
        const h = computeSearchHighlight(
            [n('a', { secondary: 'tech' }), n('b', { secondary: 'people' })],
            [],
            'people',
        );
        expect([...h.matched]).toEqual(['b']);
    });

    it('matches against badge', () => {
        const h = computeSearchHighlight(
            [n('a', { badge: 'IMPLEMENTED' }), n('b', { badge: 'PLANNED' })],
            [],
            'plan',
        );
        expect([...h.matched]).toEqual(['b']);
    });

    it('reports matchCount accurately', () => {
        const h = computeSearchHighlight(
            [
                n('a', { label: 'control 1' }),
                n('b', { label: 'control 2' }),
                n('c', { label: 'risk x' }),
            ],
            [],
            'control',
        );
        expect(h.matchCount).toBe(2);
    });
});

// ─── Adjacency ─────────────────────────────────────────────────────────

describe('computeSearchHighlight — adjacency', () => {
    it('includes one-hop neighbours along edges (direction-agnostic)', () => {
        // a — b — c — d   (matched only 'b')
        const nodes = ['a', 'b', 'c', 'd'].map((id) => n(id, { label: id }));
        const edges = [e('e1', 'a', 'b'), e('e2', 'b', 'c'), e('e3', 'c', 'd')];
        const h = computeSearchHighlight(nodes, edges, 'b');
        expect([...h.matched]).toEqual(['b']);
        expect([...h.adjacent].sort()).toEqual(['a', 'c']);
        expect([...h.dimmed]).toEqual(['d']);
    });

    it('does not include matched nodes in adjacent (Sets are disjoint)', () => {
        const nodes = [n('a', { label: 'X' }), n('b', { label: 'X' })];
        const edges = [e('e1', 'a', 'b')];
        const h = computeSearchHighlight(nodes, edges, 'x');
        expect([...h.matched].sort()).toEqual(['a', 'b']);
        expect(h.adjacent.size).toBe(0);
        expect(h.dimmed.size).toBe(0);
    });

    it('keeps disjointness with self-loops', () => {
        const nodes = [n('a', { label: 'X' })];
        const edges = [e('e1', 'a', 'a')];
        const h = computeSearchHighlight(nodes, edges, 'x');
        expect([...h.matched]).toEqual(['a']);
        expect(h.adjacent.size).toBe(0);
    });

    it('every node is dimmed when there are zero matches', () => {
        const nodes = [n('a'), n('b')];
        const h = computeSearchHighlight(nodes, [e('e1', 'a', 'b')], 'no-such-thing');
        expect(h.matched.size).toBe(0);
        expect(h.adjacent.size).toBe(0);
        expect([...h.dimmed].sort()).toEqual(['a', 'b']);
    });
});

// ─── Edge dimming ──────────────────────────────────────────────────────

describe('isEdgeDimmed', () => {
    it('returns true if either endpoint is dimmed', () => {
        const dimmed = new Set(['x']);
        expect(isEdgeDimmed(e('e1', 'a', 'x'), dimmed)).toBe(true);
        expect(isEdgeDimmed(e('e2', 'x', 'b'), dimmed)).toBe(true);
    });

    it('returns false when neither endpoint is dimmed', () => {
        const dimmed = new Set(['z']);
        expect(isEdgeDimmed(e('e1', 'a', 'b'), dimmed)).toBe(false);
    });
});
