/**
 * Framework & Requirement DTOs
 */
import { z } from 'zod';

export const FrameworkDTOSchema = z.object({
    id: z.string().optional(),
    key: z.string(),
    name: z.string(),
    version: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
}).passthrough();

export type FrameworkDTO = z.infer<typeof FrameworkDTOSchema>;

export const RequirementDTOSchema = z.object({
    id: z.string(),
    code: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    section: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
}).passthrough();

export type RequirementDTO = z.infer<typeof RequirementDTOSchema>;
