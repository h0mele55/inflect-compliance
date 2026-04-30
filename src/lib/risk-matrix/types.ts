/**
 * Public types for the tenant-scoped risk-matrix configuration
 * (Epic 44). Kept in a `.ts` (no JSX) so server, client, tests, and
 * PDF report renderers can all import the shape without dragging UI
 * code along.
 */

export interface RiskMatrixBand {
    /** Severity name shown in the legend / cell tooltip. */
    name: string;
    /** Inclusive min score (`likelihood * impact`). */
    minScore: number;
    /** Inclusive max score. */
    maxScore: number;
    /** Hex colour for the cell + legend chip. */
    color: string;
}

export interface RiskMatrixLevelLabels {
    /** Length === likelihoodLevels. Index 0 maps to score level 1. */
    likelihood: string[];
    /** Length === impactLevels. */
    impact: string[];
}

/**
 * The effective config consumed by the UI / PDF / API. Always fully
 * populated — the read usecase merges DB rows over the canonical
 * default so consumers never have to know whether the tenant has
 * customised.
 */
export interface RiskMatrixConfigShape {
    likelihoodLevels: number;
    impactLevels: number;
    axisLikelihoodLabel: string;
    axisImpactLabel: string;
    levelLabels: RiskMatrixLevelLabels;
    bands: RiskMatrixBand[];
}
