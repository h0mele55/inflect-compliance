/**
 * CSP (Content Security Policy) — nonce generation and header builder.
 *
 * Architecture:
 *   middleware.ts → generateNonce() → buildCspHeader(nonce)
 *                → sets x-csp-nonce request header  (server components read it)
 *                → sets Content-Security-Policy response header
 *
 * Next.js integration:
 *   The root layout reads the nonce from headers() and passes it through.
 *   Next.js automatically tags its own <script> and <link> tags with the nonce
 *   when it is present on the request headers.
 */

// Edge-compatible crypto — works in both Node.js and Edge Runtime
function getRandomBytes(size: number): Uint8Array {
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
        const buf = new Uint8Array(size);
        globalThis.crypto.getRandomValues(buf);
        return buf;
    }
    // Fallback for environments without WebCrypto (shouldn't happen in Next.js)
    throw new Error('CSP: No cryptographic random source available');
}

/**
 * Generate a cryptographically secure, base64-encoded nonce.
 * 16 bytes (128 bits) — matches OWASP recommendation.
 */
export function generateNonce(): string {
    const bytes = getRandomBytes(16);
    // Edge-compatible base64 encoding
    return btoa(String.fromCharCode(...bytes));
}

// ─── Directive types ────────────────────────────────────────────────

export interface CspDirectives {
    'default-src': string[];
    'script-src': string[];
    'style-src': string[];
    'img-src': string[];
    'font-src': string[];
    'connect-src': string[];
    'object-src': string[];
    'base-uri': string[];
    'frame-ancestors': string[];
    'form-action': string[];
    'worker-src'?: string[];
    'report-uri'?: string[];
    'upgrade-insecure-requests'?: true;
}

/**
 * Request header name used to pass the nonce from middleware → server components.
 * Server components read this via `headers().get(CSP_NONCE_HEADER)`.
 */
export const CSP_NONCE_HEADER = 'x-csp-nonce';

/**
 * CSP report endpoint path within the app.
 */
export const CSP_REPORT_PATH = '/api/security/csp-report';

/**
 * Report-To group name for the Reporting API.
 */
export const CSP_REPORT_GROUP = 'csp-endpoint';

/**
 * Build the full Content-Security-Policy header string.
 *
 * @param nonce  - The per-request nonce (base64)
 * @param isDev  - true for development mode (allows unsafe-eval for HMR)
 */
export function buildCspHeader(nonce: string, isDev = false): string {
    const directives: CspDirectives = {
        'default-src': ["'self'"],
        'script-src': [
            "'self'",
            `'nonce-${nonce}'`,
            "'strict-dynamic'",
            // In dev, Next.js HMR / Fast Refresh requires eval
            ...(isDev ? ["'unsafe-eval'"] : []),
        ],
        'style-src': [
            "'self'",
            `'nonce-${nonce}'`,
            // Google Fonts stylesheet
            'https://fonts.googleapis.com',
            // In dev, Next.js injects styles that may not carry the nonce
            ...(isDev ? ["'unsafe-inline'"] : []),
        ],
        'img-src': ["'self'", 'data:', 'https:'],
        'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
        'connect-src': [
            "'self'",
            'blob:',
            'https:',
            // In dev, allow HMR WebSocket
            ...(isDev ? ['ws://localhost:*', 'ws://127.0.0.1:*'] : []),
        ],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'frame-ancestors': ["'none'"],
        'form-action': ["'self'"],
        'report-uri': [CSP_REPORT_PATH],
    };

    // Only add upgrade-insecure-requests in production
    if (!isDev) {
        directives['upgrade-insecure-requests'] = true;
    }

    return serializeDirectives(directives);
}

/**
 * Serialize directives map into a CSP header string.
 */
function serializeDirectives(directives: CspDirectives): string {
    const parts: string[] = [];

    for (const [key, value] of Object.entries(directives)) {
        if (value === undefined) continue;
        if (value === true) {
            // Boolean directives like upgrade-insecure-requests
            parts.push(key);
        } else if (Array.isArray(value) && value.length > 0) {
            parts.push(`${key} ${value.join(' ')}`);
        }
    }

    return parts.join('; ');
}
