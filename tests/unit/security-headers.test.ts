import nextConfigModule from '../../next.config';

// The exported module is wrapped by withNextIntl.
// We can evaluate it by calling it or examining its exports.
describe('Security Headers (next.config.js)', () => {
    it('should expose the headers() function generating security headers', async () => {
        // withNextIntl returns a new config object
        const config = typeof nextConfigModule === 'function' ? (nextConfigModule as any)({}, {}) : nextConfigModule;

        expect(typeof config.headers).toBe('function');

        const headersArray = await config.headers();

        expect(headersArray).toBeInstanceOf(Array);
        expect(headersArray.length).toBeGreaterThan(0);

        const globalHeaders = headersArray.find((h: any) => h.source === '/(.*)');
        expect(globalHeaders).toBeDefined();

        const getHeader = (key: string) => globalHeaders.headers.find((h: any) => h.key === key)?.value;

        expect(getHeader('X-Frame-Options')).toBe('DENY');
        expect(getHeader('X-Content-Type-Options')).toBe('nosniff');
        expect(getHeader('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
        expect(getHeader('Cross-Origin-Opener-Policy')).toBe('same-origin');
        expect(getHeader('Cross-Origin-Resource-Policy')).toBe('same-origin');

        // CSP
        const csp = getHeader('Content-Security-Policy');
        expect(csp).toBeDefined();
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("frame-ancestors 'none'");
    });
});
