/**
 * Zod schemas for the tenant-scoped risk-matrix config — Epic 44.
 *
 * Two passes:
 *   1. Per-field validation (type + range + format).
 *   2. Cross-field invariants (label-array length must match the
 *      declared dimensions; bands must cover [1, max*max] without
 *      gaps or overlaps).
 *
 * Both passes run before any write reaches the database. The DB also
 * enforces a CHECK on the dimension columns as a defence-in-depth
 * fallback against a write that bypasses the API (direct SQL,
 * sibling repositories, etc.).
 */

import { z } from 'zod';

import type { RiskMatrixBand } from './types';

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const dimensionSchema = z
    .number()
    .int()
    .min(2, 'must be at least 2')
    .max(10, 'must be at most 10');

const axisTitleSchema = z.string().min(1).max(64);

const labelEntrySchema = z.string().min(1).max(64);

const bandSchema = z.object({
    name: z.string().min(1).max(32),
    minScore: z.number().int().min(1),
    maxScore: z.number().int().min(1),
    color: z.string().regex(HEX_COLOR, 'must be a hex colour like #22c55e'),
});

/**
 * Optional payload — every field is optional so an admin can patch
 * one slice (e.g. just the bands) without re-supplying the whole
 * shape. The full effective config is computed by merging this over
 * the canonical default in the usecase layer.
 */
export const updateRiskMatrixConfigSchema = z
    .object({
        likelihoodLevels: dimensionSchema.optional(),
        impactLevels: dimensionSchema.optional(),
        axisLikelihoodLabel: axisTitleSchema.optional(),
        axisImpactLabel: axisTitleSchema.optional(),
        levelLabels: z
            .object({
                likelihood: z.array(labelEntrySchema).min(2).max(10),
                impact: z.array(labelEntrySchema).min(2).max(10),
            })
            .optional()
            .nullable(),
        bands: z.array(bandSchema).min(1).max(8).optional(),
    })
    .strict();

export type UpdateRiskMatrixConfigPayload = z.infer<
    typeof updateRiskMatrixConfigSchema
>;

/**
 * Validate that `bands` cover [1, maxScore] with no gaps and no
 * overlaps. Returns a list of human-readable issues (empty when
 * valid). Standalone so the usecase + the admin UI's pre-flight
 * preview can both call it.
 */
export function validateBandsCoverage(
    bands: ReadonlyArray<RiskMatrixBand>,
    maxScore: number,
): string[] {
    const issues: string[] = [];
    if (bands.length === 0) {
        issues.push('At least one band is required.');
        return issues;
    }
    const sorted = [...bands].sort((a, b) => a.minScore - b.minScore);
    if (sorted[0].minScore !== 1) {
        issues.push(`First band must start at score 1 (got ${sorted[0].minScore}).`);
    }
    for (let i = 0; i < sorted.length; i += 1) {
        const cur = sorted[i];
        if (cur.minScore > cur.maxScore) {
            issues.push(
                `Band "${cur.name}" has minScore (${cur.minScore}) > maxScore (${cur.maxScore}).`,
            );
        }
        if (i > 0) {
            const prev = sorted[i - 1];
            if (cur.minScore !== prev.maxScore + 1) {
                issues.push(
                    `Bands "${prev.name}" → "${cur.name}" have a gap or overlap at score ${prev.maxScore}/${cur.minScore}.`,
                );
            }
        }
    }
    const last = sorted[sorted.length - 1];
    if (last.maxScore !== maxScore) {
        issues.push(
            `Last band must end at score ${maxScore} (got ${last.maxScore}). ` +
                'Bands must cover the full likelihood × impact range.',
        );
    }
    return issues;
}

/**
 * Validate that, IF `levelLabels` is supplied, the per-axis array
 * lengths match the declared dimensions. Returns a list of human-
 * readable issues (empty when valid).
 */
export function validateLevelLabelsLength(opts: {
    levelLabels?: { likelihood: readonly string[]; impact: readonly string[] } | null;
    likelihoodLevels: number;
    impactLevels: number;
}): string[] {
    const issues: string[] = [];
    if (!opts.levelLabels) return issues;
    if (opts.levelLabels.likelihood.length !== opts.likelihoodLevels) {
        issues.push(
            `levelLabels.likelihood has ${opts.levelLabels.likelihood.length} entries; expected ${opts.likelihoodLevels}.`,
        );
    }
    if (opts.levelLabels.impact.length !== opts.impactLevels) {
        issues.push(
            `levelLabels.impact has ${opts.levelLabels.impact.length} entries; expected ${opts.impactLevels}.`,
        );
    }
    return issues;
}
