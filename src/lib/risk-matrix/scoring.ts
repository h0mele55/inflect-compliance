/**
 * Pure band-lookup helpers for the tenant-scoped risk matrix —
 * Epic 44.2.
 *
 * Lives in a `.ts` (no JSX) so server, client, tests, and PDF report
 * renderers can all resolve a band → colour without dragging UI code
 * along. Mirrors the design of `freshness.ts` from Epic 43.
 */

import type {
    RiskMatrixBand,
    RiskMatrixConfigShape,
} from './types';

export interface ResolvedRiskCell {
    /** Likelihood (1-based). */
    likelihood: number;
    /** Impact (1-based). */
    impact: number;
    /** Inherent score = likelihood × impact. */
    score: number;
    /** Resolved severity band (always defined — empty bands fall through to a neutral band). */
    band: RiskMatrixBand;
    /** Per-axis label resolved from config (or stringified numeric fallback). */
    likelihoodLabel: string;
    impactLabel: string;
}

const NEUTRAL_BAND: RiskMatrixBand = {
    name: 'Unbanded',
    minScore: 0,
    maxScore: Number.POSITIVE_INFINITY,
    color: '#6b7280',
};

/**
 * Find the band whose `[minScore, maxScore]` contains the score.
 * Returns a neutral fallback when bands are empty or the score
 * falls outside any defined range — defensive so a momentarily-
 * inconsistent config (e.g. mid-edit preview) still renders rather
 * than throwing.
 */
export function resolveBandForScore(
    score: number,
    bands: ReadonlyArray<RiskMatrixBand>,
): RiskMatrixBand {
    if (!bands || bands.length === 0) return NEUTRAL_BAND;
    for (const band of bands) {
        if (score >= band.minScore && score <= band.maxScore) return band;
    }
    return NEUTRAL_BAND;
}

/**
 * Build the resolved cell view-model from the config. Useful for
 * cell renderers and PDF exporters that want all the labels +
 * band colour in one go.
 */
export function resolveCell(
    likelihood: number,
    impact: number,
    config: RiskMatrixConfigShape,
): ResolvedRiskCell {
    const score = likelihood * impact;
    const band = resolveBandForScore(score, config.bands);
    const likelihoodLabel =
        config.levelLabels.likelihood[likelihood - 1] ?? String(likelihood);
    const impactLabel =
        config.levelLabels.impact[impact - 1] ?? String(impact);
    return { likelihood, impact, score, band, likelihoodLabel, impactLabel };
}

/**
 * Return all bands that intersect a score range. Useful for the
 * legend's "this band covers …" footer.
 */
export function bandRangeLabel(band: RiskMatrixBand): string {
    if (band.minScore === band.maxScore) return String(band.minScore);
    if (!Number.isFinite(band.maxScore)) return `${band.minScore}+`;
    return `${band.minScore}–${band.maxScore}`;
}
