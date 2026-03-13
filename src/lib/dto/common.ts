/**
 * Shared DTO schemas and types for API responses.
 * All schemas use z.infer<> for type derivation.
 */
import { z } from 'zod';

// ─── Shared Refs ───

/** Minimal user reference returned in most includes */
export const UserRefSchema = z.object({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string().nullable().optional(),
});
export type UserRef = z.infer<typeof UserRefSchema>;

/** Short user reference (id + name only, no email) */
export const UserRefShortSchema = z.object({
    id: z.string(),
    name: z.string().nullable(),
});
export type UserRefShort = z.infer<typeof UserRefShortSchema>;

// ─── Standard Error Shape ───

/** Matches ApiErrorResponse from src/lib/errors/types.ts */
export const ApiErrorResponseSchema = z.object({
    error: z.object({
        code: z.string(),
        message: z.string(),
        requestId: z.string().optional(),
        details: z.unknown().optional(),
    }),
});
export type ApiErrorResponseDTO = z.infer<typeof ApiErrorResponseSchema>;

// ─── Pagination ───

export interface PaginatedResponse<T> {
    items: T[];
    nextCursor?: string;
    total?: number;
}

// ─── Audit Log Entry ───

export const AuditLogEntrySchema = z.object({
    id: z.string(),
    action: z.string(),
    entity: z.string().optional(),
    entityId: z.string().optional(),
    details: z.string().nullable(),
    createdAt: z.string(),
    user: UserRefShortSchema.nullable().optional(),
}).passthrough();
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

// ─── Success Responses ───

export const SuccessResponseSchema = z.object({
    success: z.literal(true),
});
export type SuccessResponse = z.infer<typeof SuccessResponseSchema>;
