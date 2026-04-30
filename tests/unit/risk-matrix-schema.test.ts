/**
 * Unit tests for the risk-matrix Zod schema + cross-field invariants
 * — Epic 44.
 *
 * Two passes:
 *   - per-field (Zod): dimensions in [2,10], hex colour format,
 *     label-array bounds, score positivity.
 *   - cross-field: bands cover [1, max*max] without gaps/overlaps,
 *     label-array length matches dimensions when supplied.
 *
 * Both are tested standalone here; the usecase test exercises them
 * together under the merge-on-write flow.
 */

import {
    updateRiskMatrixConfigSchema,
    validateBandsCoverage,
    validateLevelLabelsLength,
} from '@/lib/risk-matrix/schema';

describe('updateRiskMatrixConfigSchema', () => {
    it('accepts an empty patch', () => {
        expect(updateRiskMatrixConfigSchema.parse({})).toEqual({});
    });

    it('accepts a full valid patch', () => {
        const ok = updateRiskMatrixConfigSchema.parse({
            likelihoodLevels: 5,
            impactLevels: 5,
            axisLikelihoodLabel: 'Probability',
            axisImpactLabel: 'Severity',
            levelLabels: {
                likelihood: ['Rare', 'Unlikely', 'Possible', 'Likely', 'Certain'],
                impact: ['1', '2', '3', '4', '5'],
            },
            bands: [
                { name: 'Low', minScore: 1, maxScore: 4, color: '#22c55e' },
                { name: 'Medium', minScore: 5, maxScore: 9, color: '#f59e0b' },
                { name: 'High', minScore: 10, maxScore: 14, color: '#ef4444' },
                { name: 'Critical', minScore: 15, maxScore: 25, color: '#7c2d12' },
            ],
        });
        expect(ok.likelihoodLevels).toBe(5);
        expect(ok.bands).toHaveLength(4);
    });

    it.each([
        ['likelihoodLevels=1', { likelihoodLevels: 1 }],
        ['likelihoodLevels=11', { likelihoodLevels: 11 }],
        ['impactLevels=0', { impactLevels: 0 }],
        ['empty axis title', { axisLikelihoodLabel: '' }],
        ['non-hex colour', {
            bands: [{ name: 'Low', minScore: 1, maxScore: 4, color: 'green' }],
        }],
        ['empty band name', {
            bands: [{ name: '', minScore: 1, maxScore: 4, color: '#22c55e' }],
        }],
    ])('rejects %s', (_label, patch) => {
        expect(() => updateRiskMatrixConfigSchema.parse(patch)).toThrow();
    });

    it('strict mode rejects unknown top-level fields', () => {
        expect(() =>
            updateRiskMatrixConfigSchema.parse({
                likelihoodLevels: 5,
                rogue: 'value',
            } as unknown as Record<string, unknown>),
        ).toThrow();
    });
});

describe('validateBandsCoverage', () => {
    const ok = [
        { name: 'Low', minScore: 1, maxScore: 4, color: '#000' },
        { name: 'Medium', minScore: 5, maxScore: 9, color: '#000' },
        { name: 'High', minScore: 10, maxScore: 14, color: '#000' },
        { name: 'Critical', minScore: 15, maxScore: 25, color: '#000' },
    ];

    it('passes the canonical 5×5 layout', () => {
        expect(validateBandsCoverage(ok, 25)).toEqual([]);
    });

    it('rejects empty bands', () => {
        expect(validateBandsCoverage([], 25)).toContain(
            'At least one band is required.',
        );
    });

    it('rejects a layout that doesn’t start at 1', () => {
        const issues = validateBandsCoverage(
            [{ name: 'X', minScore: 2, maxScore: 25, color: '#000' }],
            25,
        );
        expect(issues.some((i) => i.includes('start at score 1'))).toBe(true);
    });

    it('rejects a layout that doesn’t end at maxScore', () => {
        const issues = validateBandsCoverage(
            [{ name: 'X', minScore: 1, maxScore: 24, color: '#000' }],
            25,
        );
        expect(issues.some((i) => i.includes('end at score 25'))).toBe(true);
    });

    it('detects gaps', () => {
        const issues = validateBandsCoverage(
            [
                { name: 'Low', minScore: 1, maxScore: 4, color: '#000' },
                // skips 5
                { name: 'High', minScore: 6, maxScore: 25, color: '#000' },
            ],
            25,
        );
        expect(issues.some((i) => i.includes('gap or overlap'))).toBe(true);
    });

    it('detects overlaps', () => {
        const issues = validateBandsCoverage(
            [
                { name: 'Low', minScore: 1, maxScore: 5, color: '#000' },
                { name: 'High', minScore: 5, maxScore: 25, color: '#000' },
            ],
            25,
        );
        expect(issues.some((i) => i.includes('gap or overlap'))).toBe(true);
    });

    it('detects min > max within a band', () => {
        const issues = validateBandsCoverage(
            [
                { name: 'Backwards', minScore: 5, maxScore: 1, color: '#000' },
            ],
            25,
        );
        expect(issues.some((i) => i.includes('minScore'))).toBe(true);
    });

    it('passes a 4×6 (24-cell) custom matrix', () => {
        const bands = [
            { name: 'Low', minScore: 1, maxScore: 6, color: '#000' },
            { name: 'Medium', minScore: 7, maxScore: 12, color: '#000' },
            { name: 'High', minScore: 13, maxScore: 24, color: '#000' },
        ];
        expect(validateBandsCoverage(bands, 24)).toEqual([]);
    });
});

describe('validateLevelLabelsLength', () => {
    it('returns no issues when labels are absent', () => {
        expect(
            validateLevelLabelsLength({
                likelihoodLevels: 5,
                impactLevels: 5,
            }),
        ).toEqual([]);
    });

    it('returns no issues when labels match dimensions', () => {
        expect(
            validateLevelLabelsLength({
                likelihoodLevels: 4,
                impactLevels: 6,
                levelLabels: {
                    likelihood: ['a', 'b', 'c', 'd'],
                    impact: ['1', '2', '3', '4', '5', '6'],
                },
            }),
        ).toEqual([]);
    });

    it('flags a likelihood-array length mismatch', () => {
        const issues = validateLevelLabelsLength({
            likelihoodLevels: 5,
            impactLevels: 5,
            levelLabels: {
                likelihood: ['a', 'b'],
                impact: ['1', '2', '3', '4', '5'],
            },
        });
        expect(issues.some((i) => i.includes('likelihood'))).toBe(true);
    });

    it('flags an impact-array length mismatch', () => {
        const issues = validateLevelLabelsLength({
            likelihoodLevels: 5,
            impactLevels: 5,
            levelLabels: {
                likelihood: ['a', 'b', 'c', 'd', 'e'],
                impact: ['1'],
            },
        });
        expect(issues.some((i) => i.includes('impact'))).toBe(true);
    });
});
