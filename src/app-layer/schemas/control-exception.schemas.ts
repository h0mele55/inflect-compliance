/**
 * Epic G-5 — Zod schemas for ControlException usecase inputs.
 *
 * Source of truth for both runtime validation (in the usecase) and
 * the inferred TS types every caller (API route + UI form + the
 * eventual expiry job) uses.
 */
import { z } from 'zod';

const TextField = z
    .string()
    .min(1, 'must not be empty')
    .max(8000, 'too long')
    .transform((s) => s.trim());

const OptionalText = z
    .union([z.string().max(8000, 'too long').transform((s) => s.trim()), z.null()])
    .optional();

/**
 * `parseDate` accepts an ISO string OR a Date. We convert to Date so
 * the usecase never has to second-guess the wire format.
 */
const DateField = z.union([z.string().datetime(), z.date()]).transform((v) =>
    typeof v === 'string' ? new Date(v) : v,
);

// ── requestException ─────────────────────────────────────────────────

export const RequestExceptionSchema = z
    .object({
        controlId: z.string().min(1, 'controlId is required'),
        justification: TextField,
        compensatingControlId: z.string().min(1).optional().nullable(),
        riskAcceptedByUserId: z
            .string()
            .min(1, 'riskAcceptedByUserId is required'),
        /// Optional at request time — the approval transition can
        /// still set it. The expiry job only acts on rows whose
        /// expiresAt has been set.
        expiresAt: DateField.optional(),
    })
    .superRefine((value, ctx) => {
        if (
            value.compensatingControlId &&
            value.compensatingControlId === value.controlId
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                    'compensatingControlId must differ from controlId — a control cannot compensate for itself.',
                path: ['compensatingControlId'],
            });
        }
    });

export type RequestExceptionInput = z.infer<typeof RequestExceptionSchema>;

// ── approveException ─────────────────────────────────────────────────

export const ApproveExceptionSchema = z.object({
    /// Required at approval time — auditors expect every APPROVED
    /// exception to carry a concrete review deadline.
    expiresAt: DateField,
    /// Optional approver-side note. Not encrypted on its own — the
    /// audit-log row carries the full context.
    note: OptionalText,
});

export type ApproveExceptionInput = z.infer<typeof ApproveExceptionSchema>;

// ── rejectException ──────────────────────────────────────────────────

export const RejectExceptionSchema = z.object({
    /// Required — auditors want the rationale stored alongside the
    /// rejection. Encrypted at rest via the manifest.
    reason: TextField,
});

export type RejectExceptionInput = z.infer<typeof RejectExceptionSchema>;

// ── renewException ───────────────────────────────────────────────────

export const RenewExceptionSchema = z
    .object({
        /// Optional — caller may carry the original justification
        /// over verbatim or substitute a refreshed rationale. When
        /// omitted, the usecase copies the prior row's justification.
        justification: OptionalText,
        compensatingControlId: z.string().min(1).optional().nullable(),
        riskAcceptedByUserId: z.string().min(1).optional(),
        /// Optional at renewal — same semantics as requestException.
        expiresAt: DateField.optional(),
    });

export type RenewExceptionInput = z.infer<typeof RenewExceptionSchema>;
