'use client';

/**
 * Epic 47.2 — tenant-wide Traceability page client.
 *
 * Owns shared filter state (search query + view mode) and routes
 * it to either `<GraphExplorer>` (visual) or
 * `<TraceabilityGraphTable>` (tabular) based on the user's
 * selection.
 *
 * State preservation: the parent owns `searchQuery` + `view` —
 * neither child unmounts when the user toggles, so:
 *
 *   - the search input keeps its value,
 *   - the graph + table see the SAME computed highlight,
 *   - the kind filter set survives a toggle.
 *
 * Both views are mounted; the inactive one gets `hidden` (vs
 * unmounted) so re-toggling is instant. React Flow's canvas
 * survives the hidden round-trip without re-fitting on every
 * toggle.
 *
 * Bundle: GraphExplorer is dynamic-imported with `ssr: false` so
 * the React Flow chunk only ships to clients that hit this page.
 */

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { ToggleGroup } from '@/components/ui/toggle-group';
import { TraceabilityGraphTable } from '@/components/traceability/TraceabilityGraphTable';
import { SankeyChart } from '@/components/ui/SankeyChart';
import type {
    TraceabilityCategory,
    TraceabilityGraph,
    TraceabilityNode,
    TraceabilityNodeKind,
} from '@/lib/traceability-graph/types';

// React Flow + xyflow CSS pulls in ~150KB. `ssr: false` + dynamic
// keeps the chunk off non-traceability pages and out of SSR. The
// loading shim matches the explorer's empty-state height so
// layout doesn't jump on toggle.
const GraphExplorer = dynamic(
    () =>
        import('@/components/ui/GraphExplorer').then((m) => ({
            default: m.GraphExplorer,
        })),
    {
        ssr: false,
        loading: () => (
            <div className="w-full h-[60vh] min-h-[24rem] rounded-md border border-border-default flex items-center justify-center text-content-subtle text-sm">
                Loading graph…
            </div>
        ),
    },
);

export interface TraceabilityClientProps {
    initialGraph: TraceabilityGraph;
    tenantSlug: string;
}

type ViewMode = 'graph' | 'table' | 'sankey';

const VIEW_OPTIONS = [
    { value: 'graph', label: 'Graph' },
    { value: 'table', label: 'Table' },
    { value: 'sankey', label: 'Sankey' },
];

export function TraceabilityClient({
    initialGraph,
    tenantSlug,
}: TraceabilityClientProps) {
    const [view, setView] = useState<ViewMode>('graph');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeKinds, setActiveKinds] = useState<Set<TraceabilityNodeKind>>(
        () => new Set(initialGraph.categories.map((c) => c.kind)),
    );

    // Apply the kind filter client-side on the SAME payload — no
    // refetch on toggle. Server-side `kinds=` filter is reserved
    // for cases where the tenant graph is too big to ship in full
    // (a future enhancement; the explorer handles capping today).
    const filteredGraph = useMemo<TraceabilityGraph>(() => {
        if (activeKinds.size === initialGraph.categories.length) {
            return initialGraph;
        }
        const keepIds = new Set(
            initialGraph.nodes
                .filter((n) => activeKinds.has(n.kind))
                .map((n) => n.id),
        );
        return {
            nodes: initialGraph.nodes.filter((n) => keepIds.has(n.id)),
            edges: initialGraph.edges.filter(
                (e) => keepIds.has(e.source) && keepIds.has(e.target),
            ),
            categories: initialGraph.categories.filter((c) => activeKinds.has(c.kind)),
            meta: initialGraph.meta,
        };
    }, [initialGraph, activeKinds]);

    const toggleKind = (kind: TraceabilityNodeKind) => {
        setActiveKinds((prev) => {
            const next = new Set(prev);
            if (next.has(kind)) next.delete(kind);
            else next.add(kind);
            return next;
        });
    };

    const handleNodeSelected = (node: TraceabilityNode) => {
        // Default click behaviour is the inline <Link> on the
        // node card (set via nodeAsLinks). This callback is the
        // hook for analytics or a future side-panel — currently
        // a no-op.
        void node;
    };

    return (
        <div className="space-y-4" id="traceability-page" data-tenant-slug={tenantSlug}>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1
                        className="text-2xl font-bold text-content-emphasis"
                        id="traceability-heading"
                    >
                        Traceability
                    </h1>
                    <p className="text-sm text-content-muted mt-1">
                        Explore how controls, risks, and assets connect across this tenant.
                    </p>
                </div>
                {/* `id` lives on a wrapping element rather than the
                    ToggleGroup itself — the primitive doesn't accept
                    a top-level id prop. The wrapper id is what E2E
                    selectors target. */}
                <div id="traceability-view-toggle">
                    <ToggleGroup
                        size="sm"
                        ariaLabel="Traceability view mode"
                        options={VIEW_OPTIONS}
                        selected={view}
                        selectAction={(v) => setView(v as ViewMode)}
                    />
                </div>
            </div>

            {/* Filters bar — search + kind chips */}
            <div className="glass-card p-3 space-y-3" id="traceability-filters">
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle"
                            aria-hidden="true"
                        />
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search nodes by label, code, or status..."
                            className="input w-full pl-8"
                            id="traceability-search"
                            aria-label="Search graph nodes"
                        />
                    </div>
                </div>
                <CategoryLegend
                    categories={initialGraph.categories}
                    active={activeKinds}
                    onToggle={toggleKind}
                />
            </div>

            {/* Both views mounted; toggle just swaps `hidden`. State
                stays put across switches — re-render cost on toggle
                is one DOM-attribute flip. */}
            <div className={view === 'graph' ? '' : 'hidden'} data-view="graph">
                <GraphExplorer
                    graph={filteredGraph}
                    searchQuery={searchQuery}
                    onNodeSelected={handleNodeSelected}
                    nodeAsLinks
                />
            </div>
            <div className={view === 'table' ? '' : 'hidden'} data-view="table">
                <TraceabilityGraphTable
                    graph={filteredGraph}
                    searchQuery={searchQuery}
                />
            </div>
            <div className={view === 'sankey' ? '' : 'hidden'} data-view="sankey">
                <SankeyChart graph={filteredGraph} searchQuery={searchQuery} />
            </div>
        </div>
    );
}

// ─── Category legend / kind filter ─────────────────────────────────────

const COLOR_BG: Record<TraceabilityCategory['color'], string> = {
    sky: 'bg-sky-500',
    rose: 'bg-rose-500',
    emerald: 'bg-emerald-500',
    violet: 'bg-violet-500',
    amber: 'bg-amber-500',
    slate: 'bg-slate-500',
};

function CategoryLegend({
    categories,
    active,
    onToggle,
}: {
    categories: ReadonlyArray<TraceabilityCategory>;
    active: ReadonlySet<TraceabilityNodeKind>;
    onToggle: (kind: TraceabilityNodeKind) => void;
}) {
    return (
        <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Filter by entity kind"
            id="traceability-legend"
        >
            {categories.map((c) => {
                const isActive = active.has(c.kind);
                return (
                    <button
                        key={c.kind}
                        type="button"
                        onClick={() => onToggle(c.kind)}
                        aria-pressed={isActive}
                        data-kind-toggle={c.kind}
                        data-active={isActive ? 'true' : 'false'}
                        className={
                            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border transition-colors ' +
                            (isActive
                                ? 'border-border-default bg-bg-muted text-content-emphasis'
                                : 'border-border-subtle text-content-subtle hover:text-content-emphasis')
                        }
                    >
                        <span
                            aria-hidden="true"
                            className={`w-2 h-2 rounded-full ${COLOR_BG[c.color]} ${isActive ? '' : 'opacity-30'}`}
                        />
                        <span>{c.pluralLabel}</span>
                        <span className="text-[10px] text-content-subtle tabular-nums">
                            {c.count}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
