/**
 * SSO Structured Logging
 *
 * Provides structured, secret-safe logging for all SSO operations.
 * Uses a consistent format for easy parsing in production log aggregators.
 *
 * SAFETY RULES:
 * - Never log raw tokens, assertions, or secrets
 * - Never log client secrets, certificates, or private keys
 * - Redact sensitive URL parameters
 * - Always include tenantSlug and provider type for correlation
 */

export type SsoLogLevel = 'info' | 'warn' | 'error';

export interface SsoLogContext {
    /** Unique request identifier for correlation */
    requestId?: string;
    /** Tenant slug (not ID — safe for logs) */
    tenantSlug?: string;
    /** Provider type: OIDC or SAML */
    providerType?: 'OIDC' | 'SAML';
    /** Provider ID */
    providerId?: string;
    /** Stage of the SSO flow */
    stage?: SsoStage;
    /** Additional safe metadata */
    meta?: Record<string, string | number | boolean | null>;
}

export type SsoStage =
    | 'start'
    | 'discovery'
    | 'authn_request'
    | 'callback_received'
    | 'state_validation'
    | 'token_exchange'
    | 'response_validation'
    | 'nonce_validation'
    | 'claims_extraction'
    | 'identity_linking'
    | 'session_creation'
    | 'redirect'
    | 'config_load'
    | 'error';

/**
 * Log an SSO event with structured context.
 * Output format is JSON for easy parsing in production.
 */
export function ssoLog(
    level: SsoLogLevel,
    message: string,
    context: SsoLogContext
): void {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        component: 'sso',
        message,
        ...context,
    };

    switch (level) {
        case 'error':
            console.error(JSON.stringify(entry));
            break;
        case 'warn':
            console.warn(JSON.stringify(entry));
            break;
        default:
            console.log(JSON.stringify(entry));
    }
}

/**
 * Generate a short request ID for SSO flow correlation.
 */
export function generateSsoRequestId(): string {
    return `sso-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Redact sensitive values from a URL for logging.
 * Keeps path and host, replaces sensitive query params.
 */
export function redactSsoUrl(url: string): string {
    try {
        const parsed = new URL(url);
        const sensitiveParams = [
            'code', 'state', 'SAMLResponse', 'RelayState',
            'client_secret', 'token', 'id_token', 'access_token',
        ];
        for (const param of sensitiveParams) {
            if (parsed.searchParams.has(param)) {
                parsed.searchParams.set(param, '[REDACTED]');
            }
        }
        return parsed.toString();
    } catch {
        return '[INVALID_URL]';
    }
}
