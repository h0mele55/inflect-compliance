/**
 * Risk DTOs — mirrors shapes returned by RiskRepository.list() and .getById()
 */
import { z } from 'zod';

// ─── Linked control sub-shape ───

const RiskControlRefSchema = z.object({
    id: z.string(),
    control: z.object({
        id: z.string(),
        name: z.string(),
        annexId: z.string().nullable().optional(),
        status: z.string(),
    }).passthrough(),
}).passthrough();

// ─── Risk List Item ───
// Returned by RiskRepository.list() — includes linked controls (summary)

export const RiskListItemDTOSchema = z.object({
    id: z.string(),
    tenantId: z.string(),
    title: z.string(),
    description: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    threat: z.string().nullable().optional(),
    vulnerability: z.string().nullable().optional(),
    impact: z.number(),
    likelihood: z.number(),
    inherentScore: z.number().nullable(),
    score: z.number().nullable(),
    status: z.string(),
    treatment: z.string().nullable().optional(),
    treatmentOwner: z.string().nullable().optional(),
    treatmentNotes: z.string().nullable().optional(),
    ownerUserId: z.string().nullable().optional(),
    createdByUserId: z.string().nullable().optional(),
    targetDate: z.string().nullable().optional(),
    nextReviewAt: z.string().nullable().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    controls: z.array(RiskControlRefSchema).optional(),
}).passthrough();

export type RiskListItemDTO = z.infer<typeof RiskListItemDTOSchema>;

// ─── Risk Detail ───
// Returned by RiskRepository.getById() — includes full control objects

export const RiskDetailDTOSchema = RiskListItemDTOSchema.extend({
    controls: z.array(z.object({
        id: z.string(),
        control: z.object({}).passthrough(),
    }).passthrough()).optional(),
});

export type RiskDetailDTO = z.infer<typeof RiskDetailDTOSchema>;
