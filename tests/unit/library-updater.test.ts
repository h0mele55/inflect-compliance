/**
 * Tests for the Library Updater — Requirement Diffing & Migration Strategies.
 *
 * These tests cover the pure-logic layer of the update pipeline:
 * - Diff computation between requirement sets
 * - Migration strategy application
 * - Strategy-specific behavior (preserve, clamp, reset, rule-of-three)
 * - Score impact detection
 * - Review detection
 * - Human-readable diff summaries
 */
import {
    computeRequirementDiff,
    applyMigrationStrategy,
    requiresReview,
    summarizeDiff,
    type DiffableRequirement,
    type RequirementDiff,
    type MigrationStrategy,
} from '@/app-layer/services/library-updater';

// ─── Test Fixtures ───────────────────────────────────────────────────

const REQS_V1: DiffableRequirement[] = [
    { code: 'R1', title: 'Requirement 1', description: 'Desc 1', category: 'Cat A', section: 'Sec 1' },
    { code: 'R2', title: 'Requirement 2', description: 'Desc 2', category: 'Cat A', section: 'Sec 1' },
    { code: 'R3', title: 'Requirement 3', description: 'Desc 3', category: 'Cat B', section: 'Sec 2' },
    { code: 'R4', title: 'Requirement 4', description: 'Desc 4', category: 'Cat B', section: 'Sec 2' },
];

const REQS_V2: DiffableRequirement[] = [
    { code: 'R1', title: 'Requirement 1', description: 'Desc 1', category: 'Cat A', section: 'Sec 1' },      // unchanged
    { code: 'R2', title: 'Requirement 2 (Updated)', description: 'New desc', category: 'Cat A', section: 'Sec 1' }, // changed
    // R3 removed
    { code: 'R4', title: 'Requirement 4', description: 'Desc 4', category: 'Cat B', section: 'Sec 2' },      // unchanged
    { code: 'R5', title: 'Requirement 5', description: 'Desc 5', category: 'Cat C', section: 'Sec 3' },      // added
];

// ─── Diff Computation Tests ──────────────────────────────────────────

describe('computeRequirementDiff', () => {
    it('should detect no changes when requirements are identical', () => {
        const diff = computeRequirementDiff(REQS_V1, REQS_V1);

        expect(diff.added).toHaveLength(0);
        expect(diff.removed).toHaveLength(0);
        expect(diff.changed).toHaveLength(0);
        expect(diff.unchanged).toHaveLength(4);
        expect(diff.hasScoreImpact).toBe(false);
        expect(diff.summary.totalOld).toBe(4);
        expect(diff.summary.totalNew).toBe(4);
    });

    it('should detect added requirements', () => {
        const diff = computeRequirementDiff(REQS_V1, REQS_V2);

        expect(diff.added).toHaveLength(1);
        expect(diff.added[0].code).toBe('R5');
        expect(diff.added[0].title).toBe('Requirement 5');
        expect(diff.added[0].category).toBe('Cat C');
    });

    it('should detect removed requirements', () => {
        const diff = computeRequirementDiff(REQS_V1, REQS_V2);

        expect(diff.removed).toHaveLength(1);
        expect(diff.removed[0].code).toBe('R3');
        expect(diff.removed[0].title).toBe('Requirement 3');
    });

    it('should detect changed requirements with correct field tracking', () => {
        const diff = computeRequirementDiff(REQS_V1, REQS_V2);

        expect(diff.changed).toHaveLength(1);
        expect(diff.changed[0].code).toBe('R2');
        expect(diff.changed[0].fields).toContain('title');
        expect(diff.changed[0].fields).toContain('description');
        expect(diff.changed[0].oldTitle).toBe('Requirement 2');
        expect(diff.changed[0].newTitle).toBe('Requirement 2 (Updated)');
        expect(diff.changed[0].oldDescription).toBe('Desc 2');
        expect(diff.changed[0].newDescription).toBe('New desc');
    });

    it('should detect unchanged requirements', () => {
        const diff = computeRequirementDiff(REQS_V1, REQS_V2);

        expect(diff.unchanged).toHaveLength(2);
        expect(diff.unchanged).toContain('R1');
        expect(diff.unchanged).toContain('R4');
    });

    it('should flag hasScoreImpact when requirements are added', () => {
        const diff = computeRequirementDiff(
            [{ code: 'A', title: 'A' }],
            [{ code: 'A', title: 'A' }, { code: 'B', title: 'B' }],
        );
        expect(diff.hasScoreImpact).toBe(true);
    });

    it('should flag hasScoreImpact when requirements are removed', () => {
        const diff = computeRequirementDiff(
            [{ code: 'A', title: 'A' }, { code: 'B', title: 'B' }],
            [{ code: 'A', title: 'A' }],
        );
        expect(diff.hasScoreImpact).toBe(true);
    });

    it('should NOT flag hasScoreImpact when only titles change', () => {
        const diff = computeRequirementDiff(
            [{ code: 'A', title: 'Old Title' }],
            [{ code: 'A', title: 'New Title' }],
        );
        expect(diff.hasScoreImpact).toBe(false);
    });

    it('should produce correct summary statistics', () => {
        const diff = computeRequirementDiff(REQS_V1, REQS_V2);

        expect(diff.summary).toEqual({
            totalOld: 4,
            totalNew: 4,
            addedCount: 1,
            removedCount: 1,
            changedCount: 1,
            unchangedCount: 2,
        });
    });

    it('should handle empty old set (all new)', () => {
        const diff = computeRequirementDiff([], REQS_V1);

        expect(diff.added).toHaveLength(4);
        expect(diff.removed).toHaveLength(0);
        expect(diff.changed).toHaveLength(0);
        expect(diff.unchanged).toHaveLength(0);
    });

    it('should handle empty new set (all removed)', () => {
        const diff = computeRequirementDiff(REQS_V1, []);

        expect(diff.added).toHaveLength(0);
        expect(diff.removed).toHaveLength(4);
        expect(diff.changed).toHaveLength(0);
        expect(diff.unchanged).toHaveLength(0);
    });

    it('should handle both empty sets', () => {
        const diff = computeRequirementDiff([], []);

        expect(diff.added).toHaveLength(0);
        expect(diff.removed).toHaveLength(0);
        expect(diff.changed).toHaveLength(0);
        expect(diff.unchanged).toHaveLength(0);
        expect(diff.hasScoreImpact).toBe(false);
    });
});

// ─── Migration Strategy Tests ────────────────────────────────────────

describe('applyMigrationStrategy', () => {
    let baseDiff: RequirementDiff;

    beforeEach(() => {
        baseDiff = computeRequirementDiff(REQS_V1, REQS_V2);
    });

    describe('preserve strategy', () => {
        it('should pass through the diff unchanged', () => {
            const result = applyMigrationStrategy(baseDiff, 'preserve');

            expect(result.added).toEqual(baseDiff.added);
            expect(result.removed).toEqual(baseDiff.removed);
            expect(result.changed).toEqual(baseDiff.changed);
            expect(result.unchanged).toEqual(baseDiff.unchanged);
        });
    });

    describe('clamp strategy', () => {
        it('should mark diff as having score impact', () => {
            const result = applyMigrationStrategy(baseDiff, 'clamp');

            expect(result.hasScoreImpact).toBe(true);
        });

        it('should preserve structural changes (same adds/removes/changes)', () => {
            const result = applyMigrationStrategy(baseDiff, 'clamp');

            expect(result.added).toEqual(baseDiff.added);
            expect(result.removed).toEqual(baseDiff.removed);
            expect(result.changed).toEqual(baseDiff.changed);
        });
    });

    describe('reset strategy', () => {
        it('should mark diff as having score impact', () => {
            const result = applyMigrationStrategy(baseDiff, 'reset');

            expect(result.hasScoreImpact).toBe(true);
        });

        it('should preserve structural changes', () => {
            const result = applyMigrationStrategy(baseDiff, 'reset');

            expect(result.added).toEqual(baseDiff.added);
            expect(result.removed).toEqual(baseDiff.removed);
        });
    });

    describe('rule-of-three strategy', () => {
        it('should suppress all removals', () => {
            const result = applyMigrationStrategy(baseDiff, 'rule-of-three');

            expect(result.removed).toHaveLength(0);
            expect(result.summary.removedCount).toBe(0);
        });

        it('should allow additions', () => {
            const result = applyMigrationStrategy(baseDiff, 'rule-of-three');

            expect(result.added).toEqual(baseDiff.added);
        });

        it('should allow changes', () => {
            const result = applyMigrationStrategy(baseDiff, 'rule-of-three');

            expect(result.changed).toEqual(baseDiff.changed);
        });

        it('should flag score impact when additions exist', () => {
            const result = applyMigrationStrategy(baseDiff, 'rule-of-three');

            expect(result.hasScoreImpact).toBe(true);
        });

        it('should not flag score impact when only changes exist (no adds/removes)', () => {
            const onlyChanges = computeRequirementDiff(
                [{ code: 'R1', title: 'Old' }],
                [{ code: 'R1', title: 'New' }],
            );
            const result = applyMigrationStrategy(onlyChanges, 'rule-of-three');

            expect(result.hasScoreImpact).toBe(false);
        });
    });
});

// ─── Idempotency Tests ──────────────────────────────────────────────

describe('Idempotency', () => {
    it('should produce identical diffs when run twice on same inputs', () => {
        const diff1 = computeRequirementDiff(REQS_V1, REQS_V2);
        const diff2 = computeRequirementDiff(REQS_V1, REQS_V2);

        expect(diff1.added).toEqual(diff2.added);
        expect(diff1.removed).toEqual(diff2.removed);
        expect(diff1.changed).toEqual(diff2.changed);
        expect(diff1.unchanged).toEqual(diff2.unchanged);
        expect(diff1.summary).toEqual(diff2.summary);
    });

    it('should produce identical strategy results when applied twice', () => {
        const diff = computeRequirementDiff(REQS_V1, REQS_V2);
        const result1 = applyMigrationStrategy(diff, 'rule-of-three');
        const result2 = applyMigrationStrategy(diff, 'rule-of-three');

        expect(result1.added).toEqual(result2.added);
        expect(result1.removed).toEqual(result2.removed);
        expect(result1.changed).toEqual(result2.changed);
    });

    it('applying preserve to an unchanged diff produces no-change', () => {
        const noDiff = computeRequirementDiff(REQS_V1, REQS_V1);
        const result = applyMigrationStrategy(noDiff, 'preserve');

        expect(result.added).toHaveLength(0);
        expect(result.removed).toHaveLength(0);
        expect(result.changed).toHaveLength(0);
        expect(result.hasScoreImpact).toBe(false);
    });
});

// ─── Review Detection Tests ──────────────────────────────────────────

describe('requiresReview', () => {
    it('should require review when removals exist', () => {
        const diff = computeRequirementDiff(REQS_V1, REQS_V2);
        expect(requiresReview(diff)).toBe(true);
    });

    it('should not require review for safe changes only', () => {
        const diff = computeRequirementDiff(
            [{ code: 'R1', title: 'Old' }],
            [{ code: 'R1', title: 'New' }],
        );
        // No removals, no large additions, no score impact
        expect(requiresReview(diff)).toBe(false);
    });

    it('should require review for large additions (>10)', () => {
        const newReqs = Array.from({ length: 12 }, (_, i) => ({ code: `N${i}`, title: `New ${i}` }));
        const diff = computeRequirementDiff([], newReqs);
        expect(requiresReview(diff)).toBe(true);
    });

    it('should require review when score impact is flagged', () => {
        const diff = computeRequirementDiff(
            [{ code: 'R1', title: 'A' }],
            [{ code: 'R1', title: 'A' }, { code: 'R2', title: 'B' }],
        );
        expect(diff.hasScoreImpact).toBe(true);
        expect(requiresReview(diff)).toBe(true);
    });
});

// ─── Diff Summary Tests ─────────────────────────────────────────────

describe('summarizeDiff', () => {
    it('should summarize a mixed diff', () => {
        const diff = computeRequirementDiff(REQS_V1, REQS_V2);
        const summary = summarizeDiff(diff);

        expect(summary).toContain('+1 added');
        expect(summary).toContain('-1 removed');
        expect(summary).toContain('~1 changed');
        expect(summary).toContain('=2 unchanged');
    });

    it('should return "No changes" for identical sets', () => {
        const diff = computeRequirementDiff([], []);
        expect(summarizeDiff(diff)).toBe('No changes');
    });

    it('should handle additions only', () => {
        const diff = computeRequirementDiff([], [{ code: 'R1', title: 'A' }]);
        expect(summarizeDiff(diff)).toBe('+1 added');
    });

    it('should handle removals only', () => {
        const diff = computeRequirementDiff([{ code: 'R1', title: 'A' }], []);
        expect(summarizeDiff(diff)).toBe('-1 removed');
    });
});

// ─── Update Strategy Hook Inputs ─────────────────────────────────────

describe('Strategy hooks receive correct diff inputs', () => {
    it('preserve receives the full diff with all fields', () => {
        const diff = computeRequirementDiff(REQS_V1, REQS_V2);
        const result = applyMigrationStrategy(diff, 'preserve');

        // All added requirements have complete data
        for (const req of result.added) {
            expect(req.code).toBeDefined();
            expect(req.title).toBeDefined();
        }

        // All changed requirements have old and new values
        for (const change of result.changed) {
            expect(change.code).toBeDefined();
            expect(change.fields.length).toBeGreaterThan(0);
            expect(change.oldTitle).toBeDefined();
            expect(change.newTitle).toBeDefined();
        }

        // All removed requirements have complete data
        for (const req of result.removed) {
            expect(req.code).toBeDefined();
            expect(req.title).toBeDefined();
        }
    });

    it('all strategies receive the same diff structure', () => {
        const diff = computeRequirementDiff(REQS_V1, REQS_V2);
        const strategies: MigrationStrategy[] = ['preserve', 'clamp', 'reset', 'rule-of-three'];

        for (const strategy of strategies) {
            const result = applyMigrationStrategy(diff, strategy);

            expect(result).toHaveProperty('added');
            expect(result).toHaveProperty('removed');
            expect(result).toHaveProperty('changed');
            expect(result).toHaveProperty('unchanged');
            expect(result).toHaveProperty('hasScoreImpact');
            expect(result).toHaveProperty('summary');
        }
    });
});
