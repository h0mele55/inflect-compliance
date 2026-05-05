/**
 * Epic G-3 — Vendor Assessment Scoring Engine.
 *
 * Pure-function aggregator over (questions, answers, config). Three
 * modes share the same per-answer breakdown surface so the review
 * UI can render every input that fed into the final score:
 *
 *   SIMPLE_SUM
 *     score = Σ effective(answer)
 *     Used when the questionnaire's individual answer points already
 *     carry the full weight.
 *
 *   WEIGHTED_AVERAGE
 *     score = Σ effective(answer)  ÷  Σ weight(question for answer)
 *     Normalised to a 0..N "average per unit weight" so two
 *     templates with very different question counts can be compared.
 *
 *   PASS_FAIL_THRESHOLD
 *     verdict = sum(effective) >= config.threshold ? 'PASS' : 'FAIL'
 *     score still returned (the raw sum) so reviewers see the
 *     supporting number alongside the verdict.
 *
 * `effective(answer)` = `reviewerOverridePoints ?? computedPoints`.
 * The override is applied at this layer (not at submit time) so
 * reviews remain idempotent: running the engine twice produces the
 * same number for the same set of overrides.
 *
 * @module services/vendor-assessment-scoring-engine
 */

// ─── Public types ──────────────────────────────────────────────────

export type ScoringMode =
    | 'SIMPLE_SUM'
    | 'WEIGHTED_AVERAGE'
    | 'PASS_FAIL_THRESHOLD';

export interface RatingThreshold {
    rating: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    /** Inclusive lower bound. */
    minScore?: number;
    /** Inclusive upper bound. */
    maxScore?: number;
}

export interface ScoringConfig {
    mode: ScoringMode;
    /** PASS_FAIL_THRESHOLD only. Score >= threshold ⇒ PASS. */
    threshold?: number;
    /**
     * Optional rating mapping for SIMPLE_SUM and WEIGHTED_AVERAGE.
     * Reviewers can still manually override the rating; this only
     * provides an automatic suggestion.
     */
    ratingThresholds?: RatingThreshold[];
}

export interface ScoringQuestion {
    id: string;
    weight: number;
    /** Whether this question contributes to the denominator in
     *  WEIGHTED_AVERAGE. Required-only mode is reserved for a
     *  future iteration; today every answered question contributes.
     */
    required?: boolean;
}

export interface ScoringAnswer {
    questionId: string;
    /** Auto-computed points from submission time. */
    computedPoints: number;
    /** Reviewer override; takes precedence when not null/undefined. */
    reviewerOverridePoints?: number | null;
}

export interface ScoringBreakdownEntry {
    questionId: string;
    weight: number;
    autoPoints: number;
    overridePoints: number | null;
    /** = override ?? auto. The number that landed in the sum. */
    effectivePoints: number;
}

export interface ScoringResult {
    mode: ScoringMode;
    /** SIMPLE_SUM | WEIGHTED_AVERAGE: the final score.
     *  PASS_FAIL_THRESHOLD: the raw sum behind the verdict. */
    score: number;
    /** Sum of weights across answered questions (denominator for
     *  WEIGHTED_AVERAGE; useful in the UI for context). */
    totalWeight: number;
    /** Sum of auto-computed points before any overrides.
     *  Surfaced so the UI can show "auto: X → reviewed: Y". */
    autoSum: number;
    /** Sum of effective points (post-override). */
    effectiveSum: number;
    verdict?: 'PASS' | 'FAIL';
    suggestedRating?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
    breakdown: ScoringBreakdownEntry[];
}

// ─── Engine ────────────────────────────────────────────────────────

export function scoreAssessment(input: {
    questions: ScoringQuestion[];
    answers: ScoringAnswer[];
    config?: ScoringConfig | null;
}): ScoringResult {
    const config = normaliseConfig(input.config);
    const questionMap = new Map(input.questions.map((q) => [q.id, q]));

    const breakdown: ScoringBreakdownEntry[] = [];
    let autoSum = 0;
    let effectiveSum = 0;
    let totalWeight = 0;

    for (const a of input.answers) {
        const q = questionMap.get(a.questionId);
        if (!q) continue;
        const auto = Number.isFinite(a.computedPoints) ? a.computedPoints : 0;
        const override =
            a.reviewerOverridePoints !== null &&
            a.reviewerOverridePoints !== undefined &&
            Number.isFinite(a.reviewerOverridePoints)
                ? a.reviewerOverridePoints
                : null;
        const effective = override ?? auto;
        const weight = Number.isFinite(q.weight) ? q.weight : 1;

        autoSum += auto;
        effectiveSum += effective;
        totalWeight += weight;

        breakdown.push({
            questionId: a.questionId,
            weight,
            autoPoints: auto,
            overridePoints: override,
            effectivePoints: effective,
        });
    }

    const result: ScoringResult = {
        mode: config.mode,
        score: 0,
        totalWeight,
        autoSum,
        effectiveSum,
        breakdown,
    };

    switch (config.mode) {
        case 'SIMPLE_SUM':
            result.score = effectiveSum;
            result.suggestedRating = deriveRating(
                effectiveSum,
                config.ratingThresholds,
            );
            break;
        case 'WEIGHTED_AVERAGE':
            // Defensive divide-by-zero — empty assessment is an
            // edge case for the review UI, not the runtime.
            result.score = totalWeight > 0 ? effectiveSum / totalWeight : 0;
            result.suggestedRating = deriveRating(
                result.score,
                config.ratingThresholds,
            );
            break;
        case 'PASS_FAIL_THRESHOLD': {
            const threshold = config.threshold ?? 0;
            result.score = effectiveSum;
            result.verdict = effectiveSum >= threshold ? 'PASS' : 'FAIL';
            // PASS_FAIL doesn't produce a categorical rating; the
            // review UI surfaces the verdict directly. We still
            // honour ratingThresholds if the operator configured
            // them — useful when the same template is used for
            // both compliance gates AND vendor-tier triage.
            result.suggestedRating = deriveRating(
                effectiveSum,
                config.ratingThresholds,
            );
            break;
        }
    }

    return result;
}

// ─── Helpers ───────────────────────────────────────────────────────

function normaliseConfig(
    raw: ScoringConfig | null | undefined,
): ScoringConfig {
    if (!raw) return { mode: 'SIMPLE_SUM' };
    return {
        mode: raw.mode,
        threshold: raw.threshold,
        ratingThresholds: raw.ratingThresholds,
    };
}

/**
 * Walk rating thresholds and return the first that brackets the
 * score. Returns null when no thresholds are configured OR when
 * the score doesn't match any bucket. The reviewer can still
 * supply a manual override on top.
 */
function deriveRating(
    score: number,
    thresholds: RatingThreshold[] | undefined,
): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null {
    if (!thresholds || thresholds.length === 0) return null;
    for (const t of thresholds) {
        const minOk = t.minScore === undefined || score >= t.minScore;
        const maxOk = t.maxScore === undefined || score <= t.maxScore;
        if (minOk && maxOk) return t.rating;
    }
    return null;
}

/**
 * Parse a stored `scoringConfigJson` blob. Returns null for both
 * missing-config and invalid-config — invalid is logged at the
 * caller (review usecase) so the reviewer sees a clear "couldn't
 * parse this template's scoring config" surface rather than a
 * silent fall-through to SIMPLE_SUM.
 */
export function parseScoringConfig(
    raw: unknown,
): ScoringConfig | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as {
        mode?: unknown;
        threshold?: unknown;
        ratingThresholds?: unknown;
    };
    const mode =
        r.mode === 'SIMPLE_SUM' ||
        r.mode === 'WEIGHTED_AVERAGE' ||
        r.mode === 'PASS_FAIL_THRESHOLD'
            ? r.mode
            : null;
    if (!mode) return null;

    const config: ScoringConfig = { mode };
    if (typeof r.threshold === 'number' && Number.isFinite(r.threshold)) {
        config.threshold = r.threshold;
    }
    if (Array.isArray(r.ratingThresholds)) {
        const out: RatingThreshold[] = [];
        for (const t of r.ratingThresholds) {
            if (!t || typeof t !== 'object') continue;
            const tr = t as {
                rating?: unknown;
                minScore?: unknown;
                maxScore?: unknown;
            };
            if (
                tr.rating !== 'LOW' &&
                tr.rating !== 'MEDIUM' &&
                tr.rating !== 'HIGH' &&
                tr.rating !== 'CRITICAL'
            ) {
                continue;
            }
            const entry: RatingThreshold = { rating: tr.rating };
            if (typeof tr.minScore === 'number') entry.minScore = tr.minScore;
            if (typeof tr.maxScore === 'number') entry.maxScore = tr.maxScore;
            out.push(entry);
        }
        if (out.length > 0) config.ratingThresholds = out;
    }
    return config;
}
