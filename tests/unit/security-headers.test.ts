import * as fs from 'fs';
import * as path from 'path';

/**
 * Security headers test.
 *
 * Validates that next.config.js sets all required static security headers
 * and that CSP is NOT set statically (it's set dynamically in middleware).
 */
describe('Security Headers (next.config.js)', () => {
    const configPath = path.resolve(__dirname, '../../next.config.js');
    let configSource: string;

    beforeAll(() => {
        configSource = fs.readFileSync(configPath, 'utf-8');
    });

    it('sets X-Frame-Options DENY', () => {
        expect(configSource).toContain('X-Frame-Options');
        expect(configSource).toContain('DENY');
    });

    it('sets X-Content-Type-Options nosniff', () => {
        expect(configSource).toContain('X-Content-Type-Options');
        expect(configSource).toContain('nosniff');
    });

    it('sets Referrer-Policy', () => {
        expect(configSource).toContain('Referrer-Policy');
        expect(configSource).toContain('strict-origin-when-cross-origin');
    });

    it('sets Cross-Origin-Opener-Policy', () => {
        expect(configSource).toContain('Cross-Origin-Opener-Policy');
        expect(configSource).toContain('same-origin');
    });

    it('sets Cross-Origin-Resource-Policy', () => {
        expect(configSource).toContain('Cross-Origin-Resource-Policy');
    });

    it('sets Strict-Transport-Security', () => {
        expect(configSource).toContain('Strict-Transport-Security');
    });

    it('sets Permissions-Policy', () => {
        expect(configSource).toContain('Permissions-Policy');
    });

    it('does NOT set CSP statically (CSP is in middleware)', () => {
        // Verify the config does not have a header entry with key 'Content-Security-Policy'
        // The string may appear in comments, so we check for the key-value pattern
        expect(configSource).not.toMatch(/key:\s*['"]Content-Security-Policy['"]/);
    });

    it('has a comment noting CSP is in middleware', () => {
        expect(configSource).toContain('middleware');
    });
});
