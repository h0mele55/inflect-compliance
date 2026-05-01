'use client';

/**
 * Epic 47.2 — tenant-wide traceability TABLE view.
 *
 * Renders the same `TraceabilityGraph` payload as `<GraphExplorer>`
 * but in tabular form: one row per edge, with source / target /
 * relation columns. Sits alongside the graph view behind a toggle
 * on the traceability page.
 *
 * Why a new component vs reusing the existing `<TraceabilityPanel>`:
 * the existing panel is per-entity (controls / risks / assets
 * detail tabs). The tenant-wide page needs a flat cross-tenant
 * relationship list keyed off the same graph payload — different
 * shape, different fetching, different selection semantics. The
 * existing panel stays exactly where it lives today (untouched).
 *
 * Search + kind filter are applied to the underlying graph nodes
 * BEFORE the row table is built — same predicate as
 * `computeSearchHighlight` so the two views always agree on what's
 * "in scope".
 */

import Link from 'next/link';
import { useMemo } from 'react';
import { cn } from '@dub/utils';
import { ArrowRight } from 'lucide-react';
import { computeSearchHighlight } from '@/lib/traceability-graph/search';
import type {
    TraceabilityGraph,
    TraceabilityNode,
} from '@/lib/traceability-graph/types';

export interface TraceabilityGraphTableProps {
    graph: TraceabilityGraph;
    /** Same `searchQuery` value the explorer uses — keeps both views synced. */
    searchQuery?: string;
    id?: string;
    className?: string;
}

const RELATION_LABEL: Record<string, string> = {
    mitigates: 'mitigates',
    protects: 'protects',
    exposes: 'exposes',
    implements: 'implements',
};

export function TraceabilityGraphTable({
    graph,
    searchQuery = '',
    id = 'traceability-table',
    className,
}: TraceabilityGraphTableProps) {
    const nodeById = useMemo(
        () => new Map(graph.nodes.map((n) => [n.id, n])),
        [graph.nodes],
    );

    const highlight = useMemo(
        () => computeSearchHighlight(graph.nodes, graph.edges, searchQuery),
        [graph.nodes, graph.edges, searchQuery],
    );

    // Edges in scope: when no query, all edges. When query active,
    // any edge with at least one endpoint matched OR adjacent.
    const visibleEdges = useMemo(() => {
        if (!highlight.hasQuery) return graph.edges;
        return graph.edges.filter(
            (e) =>
                highlight.matched.has(e.source) ||
                highlight.matched.has(e.target) ||
                highlight.adjacent.has(e.source) ||
                highlight.adjacent.has(e.target),
        );
    }, [graph.edges, highlight]);

    if (graph.edges.length === 0) {
        return (
            <div
                id={id}
                data-graph-table="true"
                data-graph-table-empty="true"
                className={cn(
                    'glass-card text-center py-10 text-content-subtle',
                    className,
                )}
            >
                No traceability links to display.
            </div>
        );
    }

    return (
        <div
            id={id}
            data-graph-table="true"
            data-edge-count={visibleEdges.length}
            className={cn('glass-card overflow-hidden', className)}
        >
            <div className="px-4 py-2 border-b border-border-subtle text-xs text-content-muted">
                {visibleEdges.length} of {graph.edges.length} relationships
                {highlight.hasQuery && (
                    <span className="ml-2 text-[var(--brand-default)]">
                        · filtered by "{searchQuery.trim()}"
                    </span>
                )}
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
                <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-bg-default/95 border-b border-border-subtle">
                        <tr>
                            <th className="text-left font-semibold text-content-subtle px-3 py-2">From</th>
                            <th className="text-left font-semibold text-content-subtle px-3 py-2">Relation</th>
                            <th className="text-left font-semibold text-content-subtle px-3 py-2">To</th>
                            <th className="text-left font-semibold text-content-subtle px-3 py-2">Qualifier</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visibleEdges.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={4}
                                    className="text-center text-content-subtle italic py-6"
                                    data-graph-table-no-match="true"
                                >
                                    No relationships match "{searchQuery.trim()}"
                                </td>
                            </tr>
                        ) : (
                            visibleEdges.map((e) => {
                                const src = nodeById.get(e.source);
                                const tgt = nodeById.get(e.target);
                                return (
                                    <tr
                                        key={e.id}
                                        className="border-b border-border-subtle/50 hover:bg-bg-muted/40 transition-colors"
                                    >
                                        <td className="px-3 py-1.5 align-top">
                                            <NodeCell node={src} />
                                        </td>
                                        <td className="px-3 py-1.5 align-top text-content-muted text-[11px]">
                                            <span className="inline-flex items-center gap-1">
                                                <ArrowRight className="w-3 h-3" aria-hidden="true" />
                                                {RELATION_LABEL[e.relation] ?? e.relation}
                                            </span>
                                        </td>
                                        <td className="px-3 py-1.5 align-top">
                                            <NodeCell node={tgt} />
                                        </td>
                                        <td className="px-3 py-1.5 align-top text-content-subtle text-[11px]">
                                            {e.qualifier ?? '—'}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function NodeCell({ node }: { node: TraceabilityNode | undefined }) {
    if (!node) return <span className="text-content-subtle italic">unknown</span>;
    const inner = (
        <>
            <span className="text-[10px] uppercase tracking-wider text-content-subtle mr-1">
                {node.kind}
            </span>
            <span className="text-content-default">{node.label}</span>
        </>
    );
    if (node.href) {
        return (
            <Link
                href={node.href}
                className="hover:text-[var(--brand-default)] transition-colors no-underline"
                data-trace-table-link={node.kind}
            >
                {inner}
            </Link>
        );
    }
    return <span>{inner}</span>;
}
