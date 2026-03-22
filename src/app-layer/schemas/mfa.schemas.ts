/**
 * Zod schemas for MFA & Session Security inputs.
 */
import { z } from 'zod';

// ─── MFA Policy ─────────────────────────────────────────────────────

export const MfaPolicyEnum = z.enum(['DISABLED', 'OPTIONAL', 'REQUIRED']);
export type MfaPolicyType = z.infer<typeof MfaPolicyEnum>;

export const UpdateMfaPolicyInput = z.object({
    mfaPolicy: MfaPolicyEnum,
    sessionMaxAgeMinutes: z
        .number()
        .int()
        .min(5, 'Session max age must be at least 5 minutes')
        .max(43200, 'Session max age cannot exceed 30 days')
        .nullable()
        .optional(),
});
export type UpdateMfaPolicyInputType = z.infer<typeof UpdateMfaPolicyInput>;

// ─── MFA Enrollment ─────────────────────────────────────────────────

export const VerifyMfaInput = z.object({
    code: z
        .string()
        .length(6, 'TOTP code must be exactly 6 digits')
        .regex(/^\d{6}$/, 'TOTP code must be numeric'),
});
export type VerifyMfaInputType = z.infer<typeof VerifyMfaInput>;

// ─── Session Revocation ─────────────────────────────────────────────

export const RevokeSessionsInput = z.object({
    targetUserId: z.string().cuid().optional(), // If absent, revoke current user's sessions
});
export type RevokeSessionsInputType = z.infer<typeof RevokeSessionsInput>;
