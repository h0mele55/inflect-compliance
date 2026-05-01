/**
 * Epic 46.3 — pure helpers behind `<FrameworkMinimap>`.
 *
 * The component itself drives DOM (IntersectionObserver,
 * scrollIntoView), but the "which section is active" picker is a
 * pure reducer over visibility snapshots. Test it here so the
 * tie-break rules don't drift silently — the active highlight
 * is the most-visible cue users rely on for orientation in a
 * 500-section framework.
 */

import {
    deriveMinimapSections,
    pickActiveSection,
    type SectionVisibility,
} from '@/lib/framework-tree/minimap';
import type { FrameworkTreeNode } from '@/lib/framework-tree/types';

function v(
    id: string,
    intersectionRatio: number,
    topOffset: number,
): SectionVisibility {
    return { id, intersectionRatio, topOffset };
}

describe('deriveMinimapSections', () => {
    it('returns only top-level section nodes', () => {
        const tree: FrameworkTreeNode[] = [
            {
                id: 's-1',
                kind: 'section',
                label: 'ORG',
                title: 'ORG',
                description: null,
                descendantCount: 2,
                childCount: 2,
                hasChildren: true,
                children: [],
                complianceStatus: 'partial',
                statusCounts: { compliant: 1, partial: 0, gap: 1, na: 0, unknown: 0 },
            },
            {
                id: 's-2',
                kind: 'section',
                label: 'PEOPLE',
                title: 'PEOPLE',
                description: null,
                descendantCount: 1,
                childCount: 1,
                hasChildren: true,
                children: [],
                complianceStatus: 'compliant',
                statusCounts: { compliant: 1, partial: 0, gap: 0, na: 0, unknown: 0 },
            },
        ];
        const out = deriveMinimapSections(tree);
        expect(out).toHaveLength(2);
        expect(out[0]).toMatchObject({
            id: 's-1',
            label: 'ORG',
            descendantCount: 2,
            status: 'partial',
        });
        expect(out[1].statusCounts).toBeDefined();
    });

    it('skips non-section nodes (defensive — top level should only be sections)', () => {
        const tree: FrameworkTreeNode[] = [
            {
                id: 'r-1',
                kind: 'requirement',
                label: '1',
                title: 'r1',
                description: null,
                code: '1',
                sortOrder: 0,
                descendantCount: 0,
                childCount: 0,
                hasChildren: false,
                children: [],
            },
        ];
        expect(deriveMinimapSections(tree)).toEqual([]);
    });
});

describe('pickActiveSection', () => {
    it('returns null for empty input', () => {
        expect(pickActiveSection([])).toBeNull();
    });

    it('picks the most-visible section when one is dominant', () => {
        expect(
            pickActiveSection([
                v('a', 0.1, -200),
                v('b', 0.9, 50),
                v('c', 0.0, 800),
            ]),
        ).toBe('b');
    });

    it('tie-breaks equal visibility by smallest non-negative top offset', () => {
        // Two sections both 50% visible; the one CLOSER TO THE TOP
        // of the viewport wins (matches the reader's intuition).
        expect(
            pickActiveSection([
                v('a', 0.5, 100),
                v('b', 0.5, 30),
            ]),
        ).toBe('b');
    });

    it('does not let an above-viewport entry beat a visible one in the tiebreaker', () => {
        // Both report 0.5 — but `a` is above the viewport (top < 0).
        // The visible-from-inside one (`b`, top > 0) should still win.
        expect(
            pickActiveSection([
                v('a', 0.5, -100),
                v('b', 0.5, 80),
            ]),
        ).toBe('b');
    });

    it('falls back to the most-recently-passed section when nothing is visible', () => {
        // All sections have 0 visibility. The one we just scrolled
        // past (the one with the largest non-positive topOffset) is
        // the right active row — keeps the highlight from snapping
        // back to section 1 every time we scroll between sections.
        expect(
            pickActiveSection([
                v('a', 0, -800),
                v('b', 0, -150),
                v('c', 0, 600),
            ]),
        ).toBe('b');
    });

    it('returns the first section when nothing is visible and nothing is above', () => {
        expect(
            pickActiveSection([
                v('a', 0, 200),
                v('b', 0, 800),
            ]),
        ).toBe('a');
    });
});
