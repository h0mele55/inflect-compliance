/**
 * GAP-06 — password-lifecycle Zod inputs.
 *
 * Field shapes are deliberately narrow: routes apply length policy via
 * `validatePasswordPolicy` from `@/lib/auth/passwords`, so the Zod layer
 * only enforces "this is a non-empty string" and a hard ceiling that
 * matches the bcrypt input limit. Tightening here too aggressively
 * would force two error sites with subtly different messaging — easier
 * to keep the policy in one place.
 *
 * Names match the convention in `mfa.schemas.ts` (`<Feature>Input` +
 * `<Feature>InputType`).
 */
import { z } from 'zod';

import { MAX_PASSWORD_LENGTH } from '@/lib/auth/passwords';

// ── Email + token primitives ───────────────────────────────────────────

const EmailField = z
    .string()
    .min(1, 'Email is required')
    .max(320) // RFC 5321 ceiling — keeps body size bounded
    .email('Invalid email');

const PasswordField = z
    .string()
    .min(1, 'Password is required')
    .max(MAX_PASSWORD_LENGTH, `Password is too long`);

const TokenField = z
    .string()
    .min(1, 'Token is required')
    // 64 hex chars is the canonical reset-token length, but accepting a
    // wider range shields the route from cosmetic format drift while
    // still rejecting trivially malformed input.
    .max(256);

// ── Forgot password ────────────────────────────────────────────────────

export const ForgotPasswordInput = z
    .object({
        email: EmailField,
    })
    .strict();

export type ForgotPasswordInputType = z.infer<typeof ForgotPasswordInput>;

// ── Reset password (unauthenticated, token-bound) ──────────────────────

export const ResetPasswordInput = z
    .object({
        token: TokenField,
        newPassword: PasswordField,
    })
    .strict();

export type ResetPasswordInputType = z.infer<typeof ResetPasswordInput>;

// ── Change password (authenticated, current-password verified) ─────────

export const ChangePasswordInput = z
    .object({
        currentPassword: PasswordField,
        newPassword: PasswordField,
    })
    .strict();

export type ChangePasswordInputType = z.infer<typeof ChangePasswordInput>;
