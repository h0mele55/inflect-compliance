/**
 * Canonical 5×5 risk matrix default — Epic 44.
 *
 * Tenants without a `RiskMatrixConfig` row resolve to this shape via
 * `getRiskMatrixConfig` in the usecase layer. Keeping the default in
 * code (not in the DB) means:
 *   - migrations don't backfill every existing tenant (safer + faster)
 *   - the canonical legend stays version-controlled + reviewed
 *   - upgrades that adjust the default propagate automatically to
 *     tenants that haven't customised
 *
 * The numbers + thresholds match the pre-Epic-44 hardcoded UI:
 *   - 5×5 grid, score = likelihood × impact ∈ [1, 25]
 *   - bands at 1–4 (Low) / 5–9 (Medium) / 10–14 (High) / 15–25
 *     (Critical) — same boundaries the legacy `<RiskHeatmap>`
 *     enforced via inline `if (score >= 15)` ladders.
 *
 * Colours use raw hex (not Tailwind classes) so the contract works
 * across consumers — server-rendered PDF reports + client UI both
 * resolve a colour without bringing in the Tailwind palette.
 */

import type { RiskMatrixBand, RiskMatrixConfigShape } from './types';

/** Default per-level labels for the 5×5 shape. */
export const DEFAULT_LIKELIHOOD_LABELS = [
    'Rare',
    'Unlikely',
    'Possible',
    'Likely',
    'Almost Certain',
] as const;

export const DEFAULT_IMPACT_LABELS = [
    'Negligible',
    'Minor',
    'Moderate',
    'Major',
    'Severe',
] as const;

/**
 * Canonical 4-tier severity bands at the 5×5 score thresholds the
 * pre-Epic-44 UI enforced inline.
 */
export const DEFAULT_BANDS: readonly RiskMatrixBand[] = [
    { name: 'Low', minScore: 1, maxScore: 4, color: '#22c55e' },
    { name: 'Medium', minScore: 5, maxScore: 9, color: '#f59e0b' },
    { name: 'High', minScore: 10, maxScore: 14, color: '#ef4444' },
    { name: 'Critical', minScore: 15, maxScore: 25, color: '#7c2d12' },
];

/**
 * Full default-config shape returned by `getRiskMatrixConfig` when no
 * row exists. Intentionally `as const`-friendly so consumers can
 * narrow without `Object.assign` clobbers.
 */
export const DEFAULT_RISK_MATRIX_CONFIG: RiskMatrixConfigShape = {
    likelihoodLevels: 5,
    impactLevels: 5,
    axisLikelihoodLabel: 'Likelihood',
    axisImpactLabel: 'Impact',
    levelLabels: {
        likelihood: [...DEFAULT_LIKELIHOOD_LABELS],
        impact: [...DEFAULT_IMPACT_LABELS],
    },
    bands: DEFAULT_BANDS.map((b) => ({ ...b })),
};
