import * as fs from 'fs';
import * as path from 'path';

/**
 * Structural test that validates the CSP middleware integration
 * without importing the middleware (which has heavy auth dependencies).
 *
 * This verifies that the middleware source code correctly:
 * 1. Imports CSP utilities
 * 2. Generates a nonce
 * 3. Sets the CSP response header
 * 4. Passes the nonce via request header
 */
describe('CSP Middleware Integration (structural)', () => {
    const middlewarePath = path.resolve(__dirname, '../../src/middleware.ts');
    let source: string;

    beforeAll(() => {
        source = fs.readFileSync(middlewarePath, 'utf-8');
    });

    it('imports generateNonce from CSP module', () => {
        expect(source).toContain('generateNonce');
        expect(source).toContain('@/lib/security/csp');
    });

    it('imports buildCspHeader from CSP module', () => {
        expect(source).toContain('buildCspHeader');
    });

    it('imports CSP_NONCE_HEADER from CSP module', () => {
        expect(source).toContain('CSP_NONCE_HEADER');
    });

    it('calls generateNonce()', () => {
        expect(source).toContain('generateNonce()');
    });

    it('calls buildCspHeader with nonce', () => {
        expect(source).toContain('buildCspHeader(nonce');
    });

    it('sets CSP response header using dynamic header name', () => {
        // Middleware uses getCspHeaderName() to dynamically choose between
        // Content-Security-Policy and Content-Security-Policy-Report-Only
        expect(source).toContain('getCspHeaderName');
        expect(source).toContain('cspHeaderName');
    });

    it('passes nonce via CSP_NONCE_HEADER on request headers', () => {
        expect(source).toContain('requestHeaders.set(CSP_NONCE_HEADER, nonce)');
    });

    it('does not contain unsafe-inline or unsafe-eval hardcoded in middleware', () => {
        // The middleware itself should not hardcode unsafe directives
        // Those are only in the CSP builder for dev mode
        expect(source).not.toContain('unsafe-inline');
        expect(source).not.toContain('unsafe-eval');
    });
});
