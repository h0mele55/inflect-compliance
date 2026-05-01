/**
 * Epic 47.2 — structural ratchet for the new tenant-wide
 * traceability page + the GraphExplorer's a11y / search wiring.
 *
 * The interactive features (search dimming, kind filter, view
 * toggle, table view) need DOM rendering to test end-to-end. The
 * E2E spec covers behaviour; this ratchet locks the COMPOSITION
 * so a future "simplify" PR can't quietly strip these surfaces.
 */

import * as fs from 'fs';
import * as path from 'path';

const PAGE = path.resolve(
    __dirname,
    '../../src/app/t/[tenantSlug]/(app)/traceability/page.tsx',
);
const CLIENT = path.resolve(
    __dirname,
    '../../src/app/t/[tenantSlug]/(app)/traceability/TraceabilityClient.tsx',
);
const EXPLORER = path.resolve(
    __dirname,
    '../../src/components/ui/GraphExplorer.tsx',
);
const TABLE = path.resolve(
    __dirname,
    '../../src/components/traceability/TraceabilityGraphTable.tsx',
);
const SIDEBAR = path.resolve(
    __dirname,
    '../../src/components/layout/SidebarNav.tsx',
);
const TYPES = path.resolve(
    __dirname,
    '../../src/lib/traceability-graph/types.ts',
);

function read(p: string): string {
    return fs.readFileSync(p, 'utf-8');
}

describe('Traceability page — composition (Epic 47.2)', () => {
    const page = read(PAGE);
    const client = read(CLIENT);

    it('server page delegates to TraceabilityClient', () => {
        expect(page).toMatch(/<TraceabilityClient\b/);
        expect(page).toMatch(/getTraceabilityGraph\(/);
    });

    it('client carries graph + table + sankey view toggle (Epic 47.3)', () => {
        expect(client).toMatch(/<ToggleGroup\b/);
        expect(client).toMatch(/value:\s*'graph'/);
        expect(client).toMatch(/value:\s*'table'/);
        expect(client).toMatch(/value:\s*'sankey'/);
    });

    it('mounts ALL THREE views (state preserved across toggle)', () => {
        // Every view child is always mounted; the inactive ones
        // are hidden via className. This is the load-bearing rule
        // behind "filter state survives toggle" — extending it to
        // sankey means a sankey↔table switch is also a single
        // attribute flip with zero re-render cost.
        expect(client).toMatch(/<GraphExplorer\b/);
        expect(client).toMatch(/<TraceabilityGraphTable\b/);
        expect(client).toMatch(/<SankeyChart\b/);
        expect(client).toMatch(/data-view="graph"/);
        expect(client).toMatch(/data-view="table"/);
        expect(client).toMatch(/data-view="sankey"/);
    });

    it('owns the search query at the page level (so every view shares it)', () => {
        expect(client).toMatch(/useState\(''\)/); // searchQuery
        expect(client).toMatch(/searchQuery=\{searchQuery\}/);
        // All three views receive the same prop now.
        const matches = client.match(/searchQuery=\{searchQuery\}/g) ?? [];
        expect(matches.length).toBeGreaterThanOrEqual(3);
    });

    it('owns the kind-filter Set so it survives toggling too', () => {
        expect(client).toMatch(/activeKinds/);
        expect(client).toMatch(/data-kind-toggle/);
    });

    it('GraphExplorer is dynamically imported with ssr=false (bundle gating)', () => {
        // React Flow chunk is ~150KB. Pages that don't need it
        // shouldn't pay the bandwidth.
        expect(client).toMatch(/dynamic\(/);
        expect(client).toMatch(/ssr:\s*false/);
    });
});

describe('GraphExplorer — search + accessibility wiring', () => {
    const src = read(EXPLORER);

    it('accepts a controlled `searchQuery` prop', () => {
        expect(src).toMatch(/searchQuery\?:\s*string/);
    });

    it('uses computeSearchHighlight (not an inline reducer)', () => {
        expect(src).toMatch(/computeSearchHighlight\b/);
    });

    it('renders a no-match overlay when query yields zero hits', () => {
        expect(src).toMatch(/data-graph-no-match/);
    });

    it('renders per-kind icon (non-color cue)', () => {
        // The icon is the second cue alongside palette colour.
        expect(src).toMatch(/ShieldCheck|AlertTriangle|Box|FileText|ScrollText/);
        expect(src).toMatch(/ICON_MAP\b/);
    });

    it('renders per-kind border pattern (third cue)', () => {
        expect(src).toMatch(/PATTERN_MAP\b/);
        expect(src).toMatch(/border-dashed|border-double/);
    });

    it('exposes data-highlight-tier on each node for E2E dimming assertions', () => {
        expect(src).toMatch(/data-highlight-tier/);
    });
});

describe('Category contract — Epic 47.2 colours + accessibility', () => {
    const types = read(TYPES);

    it('color union matches the prompt palette + Slate fallback', () => {
        // Required: sky (controls), rose (risks), emerald (requirements),
        // violet (policies). Plus amber + slate as extras.
        const required = ['sky', 'rose', 'emerald', 'violet', 'amber', 'slate'];
        for (const c of required) {
            expect(types).toMatch(new RegExp(`'${c}'`));
        }
    });

    it('every kind exports iconKey + pattern (non-color cues)', () => {
        expect(types).toMatch(/iconKey/);
        expect(types).toMatch(/pattern/);
    });

    it('control uses sky (blue), risk uses rose (red), policy uses violet (purple)', () => {
        // The defaults table is the authoritative source — lock the
        // prompt's required mapping.
        const control = types.match(/control:\s*\{[^}]*color:\s*'(\w+)'/)?.[1];
        const risk = types.match(/risk:\s*\{[^}]*color:\s*'(\w+)'/)?.[1];
        const policy = types.match(/policy:\s*\{[^}]*color:\s*'(\w+)'/)?.[1];
        expect(control).toBe('sky');
        expect(risk).toBe('rose');
        expect(policy).toBe('violet');
    });
});

describe('Sidebar — traceability entry', () => {
    const src = read(SIDEBAR);

    it('mounts the Traceability link in the primary nav', () => {
        expect(src).toMatch(/\/traceability/);
        expect(src).toMatch(/'Traceability'/);
    });
});

describe('TraceabilityGraphTable — basic shape', () => {
    const src = read(TABLE);

    it('exposes test hooks (data-graph-table) for E2E', () => {
        expect(src).toMatch(/data-graph-table/);
    });

    it('shows a "no relationships match" empty cell when search filters everything out', () => {
        expect(src).toMatch(/data-graph-table-no-match/);
    });

    it('uses the same computeSearchHighlight helper as the explorer', () => {
        expect(src).toMatch(/computeSearchHighlight\b/);
    });
});
