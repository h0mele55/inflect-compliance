/**
 * Epic 46.4 — pure helpers for the FrameworkBuilder MVP.
 *
 * Drag-and-drop UI is impossible to render without a DOM
 * (`jest-environment-jsdom` isn't installed), so the load-bearing
 * coverage lives here on the array-mutation helpers + the
 * serializer + the dirty-check.
 */

import {
    type BuilderSection,
    deriveBuilderModel,
    isModelDirty,
    moveRequirement,
    moveSection,
    serializeForApi,
} from '@/lib/framework-tree/builder-state';
import {
    findUnknownRequirementIds,
    flattenOrderedSectionsToOverlay,
    applySortOrderOverlay,
} from '@/lib/framework-tree/reorder';
import type { FrameworkTreePayload } from '@/lib/framework-tree/types';

// ─── Fixtures ──────────────────────────────────────────────────────────

function fixture(): BuilderSection[] {
    return [
        {
            id: 's-org',
            label: 'ORG',
            requirements: [
                { id: 'r-5.1', code: '5.1', title: 'Policies' },
                { id: 'r-5.2', code: '5.2', title: 'Roles' },
                { id: 'r-5.3', code: '5.3', title: 'Segregation' },
            ],
        },
        {
            id: 's-people',
            label: 'PEOPLE',
            requirements: [
                { id: 'r-6.1', code: '6.1', title: 'Screening' },
                { id: 'r-6.2', code: '6.2', title: 'Conditions' },
            ],
        },
    ];
}

// ─── moveRequirement ───────────────────────────────────────────────────

describe('moveRequirement', () => {
    it('reorders within the same section', () => {
        const after = moveRequirement(
            fixture(),
            { sectionId: 's-org', requirementId: 'r-5.1' },
            { sectionId: 's-org', index: 3 },
        );
        // 5.1 dropped at index 3 in a 3-row section → end of list
        expect(after[0].requirements.map((r) => r.id)).toEqual([
            'r-5.2',
            'r-5.3',
            'r-5.1',
        ]);
    });

    it('preserves visual intent when dragging downward in the same section', () => {
        // Drag r-5.1 (idx 0) to "after r-5.2" (visual index 2). The
        // helper accounts for the post-removal shift so the user
        // sees the row land where they dropped it, not one above.
        const after = moveRequirement(
            fixture(),
            { sectionId: 's-org', requirementId: 'r-5.1' },
            { sectionId: 's-org', index: 2 },
        );
        expect(after[0].requirements.map((r) => r.id)).toEqual([
            'r-5.2',
            'r-5.1',
            'r-5.3',
        ]);
    });

    it('moves a requirement across sections', () => {
        const after = moveRequirement(
            fixture(),
            { sectionId: 's-org', requirementId: 'r-5.1' },
            { sectionId: 's-people', index: 0 },
        );
        expect(after[0].requirements.map((r) => r.id)).toEqual(['r-5.2', 'r-5.3']);
        expect(after[1].requirements.map((r) => r.id)).toEqual([
            'r-5.1',
            'r-6.1',
            'r-6.2',
        ]);
    });

    it('does not mutate the input', () => {
        const before = fixture();
        const snapshot = JSON.stringify(before);
        moveRequirement(
            before,
            { sectionId: 's-org', requirementId: 'r-5.1' },
            { sectionId: 's-people', index: 1 },
        );
        expect(JSON.stringify(before)).toBe(snapshot);
    });

    it('returns input on unknown source / target', () => {
        const after = moveRequirement(
            fixture(),
            { sectionId: 's-ghost', requirementId: 'r-5.1' },
            { sectionId: 's-org', index: 0 },
        );
        expect(after).toEqual(fixture());
    });
});

// ─── moveSection ───────────────────────────────────────────────────────

describe('moveSection', () => {
    it('reorders sections', () => {
        const after = moveSection(fixture(), 's-people', 0);
        expect(after.map((s) => s.id)).toEqual(['s-people', 's-org']);
    });

    it('handles insert past the end', () => {
        const after = moveSection(fixture(), 's-org', 99);
        expect(after.map((s) => s.id)).toEqual(['s-people', 's-org']);
    });

    it('does not mutate the input', () => {
        const before = fixture();
        const snapshot = JSON.stringify(before);
        moveSection(before, 's-org', 1);
        expect(JSON.stringify(before)).toBe(snapshot);
    });
});

// ─── serializeForApi ───────────────────────────────────────────────────

describe('serializeForApi', () => {
    it('matches the reorder endpoint contract', () => {
        const body = serializeForApi(fixture());
        expect(body).toEqual({
            sections: [
                {
                    sectionId: 's-org',
                    requirementIds: ['r-5.1', 'r-5.2', 'r-5.3'],
                },
                {
                    sectionId: 's-people',
                    requirementIds: ['r-6.1', 'r-6.2'],
                },
            ],
        });
    });
});

// ─── isModelDirty ──────────────────────────────────────────────────────

describe('isModelDirty', () => {
    it('returns false when nothing changed', () => {
        expect(isModelDirty(fixture(), fixture())).toBe(false);
    });

    it('returns true when section order changed', () => {
        const next = moveSection(fixture(), 's-people', 0);
        expect(isModelDirty(next, fixture())).toBe(true);
    });

    it('returns true when in-section requirement order changed', () => {
        const next = moveRequirement(
            fixture(),
            { sectionId: 's-org', requirementId: 'r-5.1' },
            { sectionId: 's-org', index: 2 },
        );
        expect(isModelDirty(next, fixture())).toBe(true);
    });

    it('returns true when a requirement moved across sections', () => {
        const next = moveRequirement(
            fixture(),
            { sectionId: 's-org', requirementId: 'r-5.1' },
            { sectionId: 's-people', index: 0 },
        );
        expect(isModelDirty(next, fixture())).toBe(true);
    });
});

// ─── deriveBuilderModel ────────────────────────────────────────────────

describe('deriveBuilderModel', () => {
    function payload(): FrameworkTreePayload {
        return {
            framework: {
                id: 'fw',
                key: 'TEST',
                name: 'Test',
                version: null,
                kind: 'ISO_STANDARD',
                description: null,
            },
            nodes: [
                {
                    id: 's-org',
                    kind: 'section',
                    label: 'ORG',
                    title: 'ORG',
                    description: null,
                    descendantCount: 2,
                    childCount: 2,
                    hasChildren: true,
                    children: [
                        {
                            id: 'r-5.1',
                            kind: 'requirement',
                            label: '5.1',
                            title: 'Policies',
                            description: null,
                            code: '5.1',
                            sortOrder: 0,
                            descendantCount: 1,
                            childCount: 1,
                            hasChildren: true,
                            children: [
                                {
                                    id: 'r-5.1.1',
                                    kind: 'requirement',
                                    label: '5.1.1',
                                    title: 'Sub',
                                    description: null,
                                    code: '5.1.1',
                                    sortOrder: 0,
                                    descendantCount: 0,
                                    childCount: 0,
                                    hasChildren: false,
                                    children: [],
                                },
                            ],
                        },
                    ],
                },
            ],
            totals: { sections: 1, requirements: 2, maxDepth: 3 },
        };
    }

    it('flattens sub-requirements into the section list', () => {
        const model = deriveBuilderModel(payload());
        expect(model).toHaveLength(1);
        expect(model[0].requirements.map((r) => r.id)).toEqual([
            'r-5.1',
            'r-5.1.1',
        ]);
    });
});

// ─── reorder.ts pure helpers ───────────────────────────────────────────

describe('flattenOrderedSectionsToOverlay', () => {
    it('numbers sections in 1000-step bands by default', () => {
        const out = flattenOrderedSectionsToOverlay([
            { sectionId: 's1', requirementIds: ['a', 'b'] },
            { sectionId: 's2', requirementIds: ['c'] },
        ]);
        expect(out).toEqual([
            { requirementId: 'a', sortOrder: 0 },
            { requirementId: 'b', sortOrder: 1 },
            { requirementId: 'c', sortOrder: 1000 },
        ]);
    });

    it('respects a custom stride', () => {
        const out = flattenOrderedSectionsToOverlay(
            [
                { sectionId: 's1', requirementIds: ['a'] },
                { sectionId: 's2', requirementIds: ['b'] },
            ],
            { sectionStride: 10 },
        );
        expect(out[1].sortOrder).toBe(10);
    });
});

describe('findUnknownRequirementIds', () => {
    it('returns ids not in the known set', () => {
        const known = new Set(['a', 'b']);
        const out = findUnknownRequirementIds(
            [{ sectionId: 's', requirementIds: ['a', 'ghost'] }],
            known,
        );
        expect(out).toEqual(['ghost']);
    });

    it('returns empty array when every id is known', () => {
        expect(
            findUnknownRequirementIds(
                [{ sectionId: 's', requirementIds: ['a'] }],
                new Set(['a', 'b']),
            ),
        ).toEqual([]);
    });
});

describe('applySortOrderOverlay', () => {
    it('overrides sortOrder for matched ids', () => {
        const reqs = [
            { id: 'a', sortOrder: 100 },
            { id: 'b', sortOrder: 200 },
            { id: 'c', sortOrder: 300 },
        ];
        const overlay = new Map([
            ['a', 5],
            ['c', 1],
        ]);
        const out = applySortOrderOverlay(reqs, overlay);
        // Sorted ASC by merged sortOrder: c(1), a(5), b(200).
        expect(out.map((r) => r.id)).toEqual(['c', 'a', 'b']);
        expect(out[0].sortOrder).toBe(1);
        expect(out[1].sortOrder).toBe(5);
        expect(out[2].sortOrder).toBe(200); // untouched fallback
    });

    it('does not mutate the input', () => {
        const reqs = [{ id: 'a', sortOrder: 100 }];
        const overlay = new Map([['a', 1]]);
        applySortOrderOverlay(reqs, overlay);
        expect(reqs[0].sortOrder).toBe(100);
    });
});
