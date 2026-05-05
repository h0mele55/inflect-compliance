/**
 * Epic G-3 — Vendor Assessment review + close usecases.
 *
 *   • reviewAssessment   — run the scoring engine, apply per-answer
 *                          overrides, set the final rating, transition
 *                          SUBMITTED → REVIEWED.
 *   • closeAssessment    — terminal lifecycle flip REVIEWED → CLOSED.
 *
 * Traceability invariants:
 *
 *   computedPoints (from submit)   — never overwritten
 *   reviewerOverridePoints         — set/cleared by review
 *   reviewerNotes (per-answer)     — set/cleared by review
 *   assessment.score               — final post-override score
 *   assessment.riskRating          — reviewer override OR engine
 *                                    suggestion (manual wins)
 *   assessment.reviewerNotes       — assessment-level commentary
 *
 * The engine runs entirely on the post-override view of answers, so
 * a reviewer who returns to a REVIEWED assessment to tweak one
 * override sees the new total recomputed identically.
 *
 * @module usecases/vendor-assessment-review
 */
import type { RequestContext } from '../types';
import type { VendorCriticality } from '@prisma/client';
import { runInTenantContext } from '@/lib/db-context';
import { notFound, badRequest } from '@/lib/errors/types';
import { sanitizePlainText } from '@/lib/security/sanitize';
import { logEvent } from '../events/audit';
import { assertCanApproveAssessment } from '../policies/vendor.policies';
import {
    scoreAssessment,
    parseScoringConfig,
    type ScoringResult,
} from '../services/vendor-assessment-scoring-engine';

// ─── Types ─────────────────────────────────────────────────────────

export interface ReviewOverrideInput {
    questionId: string;
    /** undefined = leave untouched; null = clear; number = set. */
    overridePoints?: number | null;
    /** undefined = leave untouched; null = clear; string = set. */
    reviewerNotes?: string | null;
}

export interface ReviewAssessmentInput {
    overrides?: ReviewOverrideInput[];
    /** Manual rating override. undefined = use engine suggestion. */
    finalRiskRating?: VendorCriticality | null;
    /** Assessment-level reviewer commentary. */
    reviewerNotes?: string | null;
}

export interface ReviewAssessmentResult {
    status: 'REVIEWED';
    score: number;
    riskRating: VendorCriticality | null;
    /** True when finalRiskRating came from the input (manual override),
     *  false when it was derived from the engine's suggestion. */
    ratingOverridden: boolean;
    /** Full scoring breakdown — drives the review-detail UI. */
    scoring: ScoringResult;
    reviewedAt: Date;
}

export interface CloseAssessmentResult {
    status: 'CLOSED';
    closedAt: Date;
}

// ─── 1. reviewAssessment ───────────────────────────────────────────

export async function reviewAssessment(
    ctx: RequestContext,
    assessmentId: string,
    input: ReviewAssessmentInput,
): Promise<ReviewAssessmentResult> {
    assertCanApproveAssessment(ctx);

    return runInTenantContext(ctx, async (db) => {
        // ── Load assessment + status guard ──
        const assessment = await db.vendorAssessment.findFirst({
            where: { id: assessmentId, tenantId: ctx.tenantId },
            select: {
                id: true,
                tenantId: true,
                status: true,
                templateVersionId: true,
                templateId: true,
            },
        });
        if (!assessment) throw notFound('Assessment not found');
        if (assessment.status !== 'SUBMITTED') {
            throw badRequest(
                `Cannot review an assessment in status ${assessment.status}. ` +
                    `Only SUBMITTED assessments can be reviewed.`,
            );
        }
        if (!assessment.templateVersionId) {
            // The G-3 review path requires the new normalized
            // template; legacy approval-flow assessments use the
            // existing decideAssessment usecase.
            throw badRequest(
                'This assessment was created via the legacy approval flow. ' +
                    'Use decideAssessment instead.',
            );
        }

        // ── Apply per-answer overrides ──
        const overrides = input.overrides ?? [];
        for (const o of overrides) {
            const data: Record<string, unknown> = {};
            if (o.overridePoints !== undefined) {
                data.reviewerOverridePoints = o.overridePoints;
            }
            if (o.reviewerNotes !== undefined) {
                data.reviewerNotes = o.reviewerNotes
                    ? sanitizePlainText(o.reviewerNotes)
                    : null;
            }
            if (Object.keys(data).length === 0) continue;
            // Use updateMany so a non-existent answer (override on a
            // never-answered question) is a no-op rather than a
            // throw — the reviewer might be ahead of the response.
            await db.vendorAssessmentAnswer.updateMany({
                where: {
                    assessmentId: assessment.id,
                    tenantId: ctx.tenantId,
                    questionId: o.questionId,
                },
                data,
            });
        }

        // ── Reload questions + (post-override) answers for engine ──
        const questions = await db.vendorAssessmentTemplateQuestion.findMany({
            where: {
                templateId: assessment.templateVersionId,
                tenantId: ctx.tenantId,
            },
            select: { id: true, weight: true, required: true },
        });
        const answers = await db.vendorAssessmentAnswer.findMany({
            where: {
                assessmentId: assessment.id,
                tenantId: ctx.tenantId,
            },
            select: {
                questionId: true,
                computedPoints: true,
                reviewerOverridePoints: true,
            },
        });

        const template = await db.vendorAssessmentTemplate.findUnique({
            where: { id: assessment.templateVersionId },
            select: { scoringConfigJson: true },
        });
        const config = parseScoringConfig(template?.scoringConfigJson ?? null);

        // ── Score ──
        const scoring = scoreAssessment({
            questions: questions.map((q) => ({
                id: q.id,
                weight: q.weight,
                required: q.required,
            })),
            answers,
            config,
        });

        // ── Resolve final rating ──
        const ratingOverridden = input.finalRiskRating !== undefined;
        const riskRating: VendorCriticality | null = ratingOverridden
            ? (input.finalRiskRating ?? null)
            : (scoring.suggestedRating ?? null);

        // ── Persist + transition ──
        const reviewedAt = new Date();
        await db.vendorAssessment.update({
            where: { id: assessment.id },
            data: {
                status: 'REVIEWED',
                reviewedAt,
                reviewedByUserId: ctx.userId,
                reviewerNotes: input.reviewerNotes
                    ? sanitizePlainText(input.reviewerNotes)
                    : input.reviewerNotes === null
                        ? null
                        : undefined,
                score: scoring.score,
                riskRating,
                decidedAt: reviewedAt,
                decidedByUserId: ctx.userId,
            },
        });

        // ── Audit ──
        await logEvent(db, ctx, {
            action: 'VENDOR_ASSESSMENT_REVIEWED',
            entityType: 'VendorAssessment',
            entityId: assessment.id,
            details:
                `Reviewed assessment with ${scoring.mode}: ` +
                `score=${formatScore(scoring.score)}, rating=${riskRating ?? 'none'}, ` +
                `overrides=${overrides.length}` +
                (scoring.verdict ? `, verdict=${scoring.verdict}` : ''),
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'VendorAssessment',
                operation: 'reviewed',
                after: {
                    status: 'REVIEWED',
                    mode: scoring.mode,
                    autoSum: scoring.autoSum,
                    effectiveSum: scoring.effectiveSum,
                    score: scoring.score,
                    riskRating,
                    ratingOverridden,
                    overrideCount: overrides.length,
                    answeredCount: scoring.breakdown.length,
                    verdict: scoring.verdict ?? null,
                    reviewedAt: reviewedAt.toISOString(),
                },
                summary: `Vendor assessment reviewed`,
            },
        });

        return {
            status: 'REVIEWED' as const,
            score: scoring.score,
            riskRating,
            ratingOverridden,
            scoring,
            reviewedAt,
        };
    });
}

// ─── 2. closeAssessment ────────────────────────────────────────────

export async function closeAssessment(
    ctx: RequestContext,
    assessmentId: string,
    notes?: string | null,
): Promise<CloseAssessmentResult> {
    assertCanApproveAssessment(ctx);

    return runInTenantContext(ctx, async (db) => {
        const assessment = await db.vendorAssessment.findFirst({
            where: { id: assessmentId, tenantId: ctx.tenantId },
            select: { id: true, status: true },
        });
        if (!assessment) throw notFound('Assessment not found');
        if (assessment.status !== 'REVIEWED') {
            throw badRequest(
                `Cannot close an assessment in status ${assessment.status}. ` +
                    `Only REVIEWED assessments can be closed.`,
            );
        }

        const closedAt = new Date();
        await db.vendorAssessment.update({
            where: { id: assessment.id },
            data: {
                status: 'CLOSED',
                closedAt,
                closedByUserId: ctx.userId,
                ...(notes !== undefined && {
                    reviewerNotes: notes
                        ? sanitizePlainText(notes)
                        : null,
                }),
            },
        });

        await logEvent(db, ctx, {
            action: 'VENDOR_ASSESSMENT_CLOSED',
            entityType: 'VendorAssessment',
            entityId: assessment.id,
            details: `Closed reviewed assessment`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'VendorAssessment',
                operation: 'closed',
                after: {
                    status: 'CLOSED',
                    closedAt: closedAt.toISOString(),
                },
                summary: `Vendor assessment closed`,
            },
        });

        return { status: 'CLOSED' as const, closedAt };
    });
}

// ─── Helpers ───────────────────────────────────────────────────────

function formatScore(n: number): string {
    if (Number.isInteger(n)) return n.toString();
    return n.toFixed(3);
}
