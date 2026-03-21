import { z } from 'zod';

/**
 * Zod schemas for Enterprise SSO configuration validation.
 *
 * These schemas validate input for creating/updating tenant identity providers
 * and define the expected structure of IdP-specific configuration blobs.
 */

// ─── Enums ───────────────────────────────────────────────────────────

export const IdentityProviderTypeSchema = z.enum(['SAML', 'OIDC']);
export type IdentityProviderType = z.infer<typeof IdentityProviderTypeSchema>;

// ─── SAML Configuration ──────────────────────────────────────────────

export const SamlConfigSchema = z.object({
    /** URL to the IdP's SAML metadata XML */
    metadataUrl: z.string().url().optional(),
    /** IdP Entity ID (if not using metadata URL) */
    entityId: z.string().min(1).optional(),
    /** SSO login URL */
    ssoUrl: z.string().url().optional(),
    /** SSO logout URL */
    sloUrl: z.string().url().optional(),
    /** Base64-encoded X.509 signing certificate */
    certificate: z.string().min(1).optional(),
    /** NameID format (default: emailAddress) */
    nameIdFormat: z.string().optional(),
    /** Whether to sign authn requests */
    signRequests: z.boolean().default(false),
}).refine(
    (data) => data.metadataUrl || (data.entityId && data.ssoUrl && data.certificate),
    { message: 'Provide either metadataUrl or (entityId + ssoUrl + certificate)' }
);

export type SamlConfig = z.infer<typeof SamlConfigSchema>;

// ─── OIDC Configuration ──────────────────────────────────────────────

export const OidcConfigSchema = z.object({
    /** OIDC Issuer URL (e.g. https://login.example.com) */
    issuer: z.string().url(),
    /** Client ID */
    clientId: z.string().min(1),
    /** Client Secret (encrypted at rest in production) */
    clientSecret: z.string().min(1),
    /** Scopes to request (default: openid email profile) */
    scopes: z.array(z.string()).default(['openid', 'email', 'profile']),
    /** Well-known discovery URL override */
    discoveryUrl: z.string().url().optional(),
});

export type OidcConfig = z.infer<typeof OidcConfigSchema>;

// ─── Email Domain Validation ─────────────────────────────────────────

const EmailDomainSchema = z.string()
    .min(3)
    .max(253)
    .regex(
        /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
        'Invalid domain format'
    )
    .transform((d) => d.toLowerCase());

// ─── Upsert Input ────────────────────────────────────────────────────

export const UpsertSsoConfigInput = z.object({
    /** Optional ID for updates — omit for create */
    id: z.string().cuid().optional(),
    /** Human-readable name */
    name: z.string().min(1).max(100),
    /** Provider type */
    type: IdentityProviderTypeSchema,
    /** Whether this provider is active */
    isEnabled: z.boolean().default(false),
    /** Whether local login is disabled when this provider is active */
    isEnforced: z.boolean().default(false),
    /** Domains associated with this IdP */
    emailDomains: z.array(EmailDomainSchema).default([]),
    /** IdP-specific configuration — will be validated by type */
    config: z.record(z.unknown()),
}).superRefine((data, ctx) => {
    // Validate config shape based on provider type
    if (data.type === 'SAML') {
        const result = SamlConfigSchema.safeParse(data.config);
        if (!result.success) {
            for (const issue of result.error.issues) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['config', ...issue.path],
                    message: issue.message,
                });
            }
        }
    } else if (data.type === 'OIDC') {
        const result = OidcConfigSchema.safeParse(data.config);
        if (!result.success) {
            for (const issue of result.error.issues) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['config', ...issue.path],
                    message: issue.message,
                });
            }
        }
    }
});

export type UpsertSsoConfigInput = z.infer<typeof UpsertSsoConfigInput>;

// ─── Output Shape ────────────────────────────────────────────────────

export const SsoConfigOutput = z.object({
    id: z.string(),
    tenantId: z.string(),
    type: IdentityProviderTypeSchema,
    name: z.string(),
    isEnabled: z.boolean(),
    isEnforced: z.boolean(),
    emailDomains: z.array(z.string()),
    configJson: z.record(z.unknown()),
    createdAt: z.date(),
    updatedAt: z.date(),
});

export type SsoConfigOutput = z.infer<typeof SsoConfigOutput>;
