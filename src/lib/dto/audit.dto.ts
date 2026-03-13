/**
 * Audit DTOs
 */
import { z } from 'zod';

export const AuditDTOSchema = z.object({
    id: z.string(),
    tenantId: z.string(),
    title: z.string(),
    scope: z.string().nullable().optional(),
    criteria: z.string().nullable().optional(),
    status: z.string(),
    schedule: z.string().nullable().optional(),
    auditors: z.string().nullable().optional(),
    auditees: z.string().nullable().optional(),
    departments: z.string().nullable().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
}).passthrough();

export type AuditDTO = z.infer<typeof AuditDTOSchema>;
