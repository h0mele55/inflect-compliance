/**
 * Admin Session Guard
 *
 * Provides stricter session/cookie posture specifically for admin routes.
 *
 * Architecture Context:
 *   Auth.js v5 supports only ONE global cookie configuration. We cannot set
 *   SameSite=strict per-route at the cookie level. To achieve equivalent
 *   protection for admin routes, this module implements:
 *
 *   1. Cross-Origin Request Blocking — Admin API mutations reject requests
 *      where the Sec-Fetch-Site header indicates a cross-origin context.
 *      This provides the same CSRF protection as SameSite=strict cookies
 *      on the routes that matter most.
 *
 *   2. Admin Session Freshness — (extensible) Admin routes can require
 *      re-authentication or a minimum session age.
 *
 * Why not SameSite=strict globally?
 *   SameSite=strict breaks OAuth redirect flows. After an OAuth provider
 *   redirects back to our app, the browser treats it as a cross-site
 *   navigation and won't send strict cookies, causing auth failure.
 *   The global cookie MUST remain SameSite=lax for OAuth to function.
 *
 * SECURITY NOTE:
 *   Sec-Fetch-Site is a Fetch Metadata Request Header supported by all
 *   modern browsers (Chrome 76+, Firefox 90+, Edge 79+, Safari 16.4+).
 *   It cannot be forged by JavaScript since it's a forbidden header name.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Sec-Fetch-Site
 * @see https://web.dev/articles/fetch-metadata
 */

/**
 * Determines if an admin API request should be blocked based on its
 * Sec-Fetch-Site header. Blocks cross-site requests to admin mutation
 * routes, providing equivalent protection to SameSite=strict cookies.
 *
 * @param secFetchSite - The Sec-Fetch-Site header value
 * @param method - The HTTP method (GET, POST, etc.)
 * @returns true if the request should be blocked
 *
 * Allowed values:
 *   - 'same-origin': Request from the same origin (always safe)
 *   - 'same-site': Request from the same site (safe for our use case)
 *   - 'none': Direct navigation (typing URL, bookmarks — safe for GET)
 *   - null/undefined: Old browser or non-browser client (allowed, since
 *     auth token is still validated by auth middleware)
 *
 * Blocked values:
 *   - 'cross-site': Request initiated cross-origin (CSRF vector)
 */
export function shouldBlockAdminRequest(
    secFetchSite: string | null | undefined,
    method: string,
): boolean {
    // If the header is absent (old browsers, curl, etc.), don't block —
    // the auth token itself is still required and provides authentication.
    // Sec-Fetch-Site cannot be forged by JavaScript in modern browsers.
    if (!secFetchSite) return false;

    // Same-origin and same-site are always allowed
    if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') {
        return false;
    }

    // Direct navigations (typing URL, bookmarks) are safe for GET/HEAD
    if (secFetchSite === 'none') {
        const safeMethod = method.toUpperCase();
        return safeMethod !== 'GET' && safeMethod !== 'HEAD';
    }

    // 'cross-site' — block ALL methods for admin routes (including GET)
    // This prevents any cross-origin request from reaching admin APIs
    if (secFetchSite === 'cross-site') {
        return true;
    }

    // Unknown value — block for safety
    return true;
}

/**
 * Set of HTTP methods considered state-changing (mutations).
 * Used for stricter enforcement on admin routes.
 */
export const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Check if a request method is a state-changing mutation.
 */
export function isMutationMethod(method: string): boolean {
    return MUTATION_METHODS.has(method.toUpperCase());
}
