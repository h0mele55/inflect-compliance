/**
 * Epic G-7 — Zod schemas for RiskTreatmentPlan / TreatmentMilestone
 * usecase inputs.
 */
import { z } from 'zod';
import { TreatmentStrategy } from '@prisma/client';

const TextField = z
    .string()
    .min(1, 'must not be empty')
    .max(2000, 'too long')
    .transform((s) => s.trim());

const OptionalText = z
    .union([z.string().max(8000, 'too long').transform((s) => s.trim()), z.null()])
    .optional();

const DateField = z.union([z.string().datetime(), z.date()]).transform((v) =>
    typeof v === 'string' ? new Date(v) : v,
);

// ── createTreatmentPlan ─────────────────────────────────────────────

export const CreateTreatmentPlanSchema = z.object({
    riskId: z.string().min(1, 'riskId required'),
    strategy: z.nativeEnum(TreatmentStrategy),
    ownerUserId: z.string().min(1, 'ownerUserId required'),
    targetDate: DateField,
});

export type CreateTreatmentPlanInput = z.infer<typeof CreateTreatmentPlanSchema>;

// ── addMilestone ────────────────────────────────────────────────────

export const AddMilestoneSchema = z.object({
    title: TextField,
    description: OptionalText,
    dueDate: DateField,
    /// Optional explicit position. Omitted ⇒ append to the end of
    /// the existing milestone list (sortOrder = max + 1).
    sortOrder: z.number().int().nonnegative().optional(),
    /// Reference to backing evidence — URL, FileRecord id, or
    /// Evidence id. The future `attachEvidence` usecase will type
    /// this as a relation; today it's a free-text reference.
    evidence: z.string().min(1).max(2000).optional().nullable(),
});

export type AddMilestoneInput = z.infer<typeof AddMilestoneSchema>;

// ── completeMilestone ───────────────────────────────────────────────

export const CompleteMilestoneSchema = z.object({
    /// Optional reference to backing evidence captured at completion
    /// time, in case the milestone was created without one.
    evidence: z.string().min(1).max(2000).optional().nullable(),
});

export type CompleteMilestoneInput = z.infer<typeof CompleteMilestoneSchema>;

// ── completePlan ────────────────────────────────────────────────────

export const CompletePlanSchema = z.object({
    /// Required closing remark — auditors expect a written rationale
    /// for plan closure. Encrypted at rest via the manifest.
    closingRemark: TextField,
});

export type CompletePlanInput = z.infer<typeof CompletePlanSchema>;

// ── changeStrategy ───────────────────────────────────────────────────

export const ChangeStrategySchema = z.object({
    strategy: z.nativeEnum(TreatmentStrategy),
    /// Required rationale — strategy changes mid-plan are uncommon
    /// and auditors will ask why. Surfaces verbatim in the audit row.
    reason: TextField,
});

export type ChangeStrategyInput = z.infer<typeof ChangeStrategySchema>;
