/**
 * Epic 46 — pure helpers behind `<TreeView>`.
 *
 * The component's render logic depends on:
 *
 *   - `flattenVisible` — turns `(nodes, expanded)` into the visible-
 *     flat row list. This function is in the hot render path; any
 *     bug here corrupts every interaction.
 *
 *   - `resolveTreeKey` — translates a keyboard event into a focus /
 *     expand / collapse effect per WAI-ARIA Authoring Practices.
 *
 *   - `toggleExpanded` / `withExpanded` — immutable expansion-set
 *     mutators.
 *
 *   - `collectExpandableIds` — utility for "Expand all" UX.
 *
 * Tested in isolation because the project doesn't ship
 * `jest-environment-jsdom`; pulling these out as pure functions
 * lets us cover the contract without rendering React.
 */

import {
    collectExpandableIds,
    filterTree,
    flattenVisible,
    getExpandToggleState,
    resolveTreeKey,
    toggleExpanded,
    withExpanded,
} from '@/lib/framework-tree/tree-helpers';
import type { TreeViewNode } from '@/lib/framework-tree/types';

interface Node extends TreeViewNode {
    id: string;
    children?: Node[];
    hasChildren?: boolean;
}

const SAMPLE: Node[] = [
    {
        id: 'a',
        children: [
            { id: 'a-1', children: [{ id: 'a-1-i' }] },
            { id: 'a-2' },
        ],
    },
    {
        id: 'b',
        children: [{ id: 'b-1' }],
    },
];

describe('flattenVisible', () => {
    it('returns only roots when nothing is expanded', () => {
        const rows = flattenVisible(SAMPLE, new Set());
        expect(rows.map((r) => r.node.id)).toEqual(['a', 'b']);
    });

    it('expands one level when a root is in the expanded set', () => {
        const rows = flattenVisible(SAMPLE, new Set(['a']));
        expect(rows.map((r) => r.node.id)).toEqual(['a', 'a-1', 'a-2', 'b']);
        expect(rows[1].depth).toBe(1);
        expect(rows[3].depth).toBe(0);
    });

    it('expands recursively when intermediate nodes are also expanded', () => {
        const rows = flattenVisible(SAMPLE, new Set(['a', 'a-1']));
        expect(rows.map((r) => r.node.id)).toEqual([
            'a',
            'a-1',
            'a-1-i',
            'a-2',
            'b',
        ]);
        const deep = rows.find((r) => r.node.id === 'a-1-i')!;
        expect(deep.depth).toBe(2);
        expect(deep.parentIds).toEqual(['a', 'a-1']);
    });

    it('skips children of unexpanded ancestors', () => {
        const rows = flattenVisible(SAMPLE, new Set(['a-1'])); // 'a' not expanded
        expect(rows.map((r) => r.node.id)).toEqual(['a', 'b']);
    });

    it('produces stable, sequential indices', () => {
        const rows = flattenVisible(SAMPLE, new Set(['a', 'a-1']));
        rows.forEach((r, i) => expect(r.index).toBe(i));
    });

    it('handles deeply nested input (5+ levels) without overflow', () => {
        // Build a 6-level chain: r0 → r1 → r2 → r3 → r4 → r5
        let leaf: Node = { id: 'r5' };
        for (let i = 4; i >= 0; i--) {
            leaf = { id: `r${i}`, children: [leaf] };
        }
        const expanded = new Set(['r0', 'r1', 'r2', 'r3', 'r4']);
        const rows = flattenVisible([leaf], expanded);
        expect(rows.map((r) => r.node.id)).toEqual([
            'r0',
            'r1',
            'r2',
            'r3',
            'r4',
            'r5',
        ]);
        expect(rows[5].depth).toBe(5);
    });
});

describe('toggleExpanded / withExpanded', () => {
    it('toggleExpanded adds when missing and removes when present', () => {
        const a = toggleExpanded(new Set(['x']), 'y');
        expect([...a].sort()).toEqual(['x', 'y']);
        const b = toggleExpanded(a, 'x');
        expect([...b].sort()).toEqual(['y']);
    });

    it('withExpanded returns the SAME set when no change is needed (referential bailout)', () => {
        const initial = new Set(['x']);
        const same = withExpanded(initial, 'x', true);
        expect(same).toBe(initial); // identity, not equality
        const off = withExpanded(initial, 'y', false);
        expect(off).toBe(initial);
    });

    it('withExpanded mutates immutably otherwise', () => {
        const initial = new Set(['x']);
        const next = withExpanded(initial, 'y', true);
        expect(next).not.toBe(initial);
        expect([...next].sort()).toEqual(['x', 'y']);
        expect([...initial]).toEqual(['x']);
    });
});

describe('collectExpandableIds', () => {
    it('returns every id with at least one child, recursively', () => {
        const ids = collectExpandableIds(SAMPLE);
        expect([...ids].sort()).toEqual(['a', 'a-1', 'b']);
    });

    it('returns an empty set for a flat list of leaves', () => {
        const ids = collectExpandableIds([{ id: 'x' }, { id: 'y' }]);
        expect(ids.size).toBe(0);
    });
});

describe('filterTree', () => {
    interface FNode extends TreeViewNode {
        id: string;
        label: string;
        children: FNode[];
    }
    const data: FNode[] = [
        {
            id: 'org',
            label: 'Organizational',
            children: [
                { id: 'r-5.1', label: 'Policies for information security', children: [] },
                { id: 'r-5.2', label: 'Roles and responsibilities', children: [] },
            ],
        },
        {
            id: 'people',
            label: 'People',
            children: [{ id: 'r-6.1', label: 'Screening', children: [] }],
        },
    ];

    it('returns the input unchanged when nothing matches', () => {
        const out = filterTree(data, () => false);
        expect(out).toEqual([]);
    });

    it('returns the matching subtree only', () => {
        const out = filterTree(data, (n) => n.id === 'people');
        expect(out.map((n) => n.id)).toEqual(['people']);
    });

    it('keeps the ancestor path of every match', () => {
        const out = filterTree(data, (n) => n.id === 'r-5.2');
        expect(out).toHaveLength(1);
        expect(out[0].id).toBe('org');
        expect(out[0].children.map((c) => c.id)).toEqual(['r-5.2']);
    });

    it('preserves the full subtree under a self-matching node', () => {
        // Match the section itself — both children should survive.
        const out = filterTree(data, (n) => n.id === 'org');
        expect(out[0].children).toHaveLength(2);
    });

    it('preserves referential identity when a node self-matches', () => {
        const out = filterTree(data, (n) => n.id === 'org');
        // Self-match short-circuits — the original node object is
        // returned, so React's referential-equality bailout fires.
        expect(out[0]).toBe(data[0]);
    });
});

describe('getExpandToggleState', () => {
    it('returns "empty" when nothing in the tree is expandable', () => {
        expect(getExpandToggleState(0, 0)).toBe('empty');
    });

    it('returns "none" when nothing is expanded', () => {
        expect(getExpandToggleState(0, 5)).toBe('none');
    });

    it('returns "all" when every expandable id is expanded', () => {
        expect(getExpandToggleState(5, 5)).toBe('all');
        expect(getExpandToggleState(7, 5)).toBe('all'); // overshoot still counts
    });

    it('returns "partial" when some but not all are expanded', () => {
        expect(getExpandToggleState(3, 5)).toBe('partial');
        expect(getExpandToggleState(1, 5)).toBe('partial');
    });
});

describe('resolveTreeKey', () => {
    const expanded = new Set(['a', 'a-1']);
    const rows = flattenVisible(SAMPLE, expanded);
    // rows = a (0), a-1 (1), a-1-i (2), a-2 (3), b (4)

    it('ArrowDown moves focus to the next visible row', () => {
        expect(resolveTreeKey('ArrowDown', 'a', rows, expanded)).toEqual({
            type: 'focus',
            id: 'a-1',
        });
    });

    it('ArrowDown on the last row is a no-op', () => {
        expect(resolveTreeKey('ArrowDown', 'b', rows, expanded)).toBeNull();
    });

    it('ArrowUp moves focus to the previous visible row', () => {
        expect(resolveTreeKey('ArrowUp', 'a-1', rows, expanded)).toEqual({
            type: 'focus',
            id: 'a',
        });
    });

    it('ArrowUp on the first row is a no-op', () => {
        expect(resolveTreeKey('ArrowUp', 'a', rows, expanded)).toBeNull();
    });

    it('Home moves focus to the first row', () => {
        expect(resolveTreeKey('Home', 'b', rows, expanded)).toEqual({
            type: 'focus',
            id: 'a',
        });
    });

    it('End moves focus to the last row', () => {
        expect(resolveTreeKey('End', 'a', rows, expanded)).toEqual({
            type: 'focus',
            id: 'b',
        });
    });

    it('ArrowRight on a collapsed parent expands it', () => {
        const rowsCollapsed = flattenVisible(SAMPLE, new Set());
        expect(resolveTreeKey('ArrowRight', 'a', rowsCollapsed, new Set())).toEqual({
            type: 'expand',
            id: 'a',
        });
    });

    it('ArrowRight on an expanded parent moves focus to first child', () => {
        expect(resolveTreeKey('ArrowRight', 'a', rows, expanded)).toEqual({
            type: 'focus',
            id: 'a-1',
        });
    });

    it('ArrowRight on a leaf is a no-op', () => {
        expect(resolveTreeKey('ArrowRight', 'a-2', rows, expanded)).toBeNull();
    });

    it('ArrowLeft on an expanded parent collapses it', () => {
        expect(resolveTreeKey('ArrowLeft', 'a', rows, expanded)).toEqual({
            type: 'collapse',
            id: 'a',
        });
    });

    it('ArrowLeft on a collapsed/leaf row moves focus to parent', () => {
        // a-1-i has no children; ArrowLeft should jump to its parent (a-1).
        expect(resolveTreeKey('ArrowLeft', 'a-1-i', rows, expanded)).toEqual({
            type: 'focus',
            id: 'a-1',
        });
    });

    it('ArrowLeft on a top-level row with no children is a no-op', () => {
        expect(resolveTreeKey('ArrowLeft', 'b', rows, expanded)).toBeNull();
    });

    it('returns null for unknown keys', () => {
        expect(resolveTreeKey('Tab', 'a', rows, expanded)).toBeNull();
        expect(resolveTreeKey('Escape', 'a', rows, expanded)).toBeNull();
    });

    it('returns null when focusedId is not in the visible rows', () => {
        expect(resolveTreeKey('ArrowDown', 'ghost', rows, expanded)).toBeNull();
    });
});
