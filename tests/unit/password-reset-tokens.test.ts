/**
 * Token primitives unit test — pure crypto, no DB.
 *
 * Asserts the entropy / hashing contracts that the rest of the password
 * lifecycle depends on. The persistence + atomic-claim behaviour lives
 * in `tests/integration/password-reset-flow.test.ts`.
 */
import {
    generateRawResetToken,
    hashResetToken,
} from '@/lib/auth/password-reset-tokens';

describe('GAP-06 — token primitives', () => {
    it('generateRawResetToken produces 64-char hex (32 bytes / 256 bits)', () => {
        const t = generateRawResetToken();
        expect(t).toMatch(/^[a-f0-9]{64}$/);
    });

    it('successive calls produce different tokens', () => {
        const a = generateRawResetToken();
        const b = generateRawResetToken();
        expect(a).not.toBe(b);
    });

    it('hashResetToken is deterministic', () => {
        const t = generateRawResetToken();
        expect(hashResetToken(t)).toBe(hashResetToken(t));
    });

    it('hashResetToken yields 64-char hex (sha256)', () => {
        const t = generateRawResetToken();
        const h = hashResetToken(t);
        expect(h).toMatch(/^[a-f0-9]{64}$/);
    });

    it('different inputs produce different hashes', () => {
        const a = generateRawResetToken();
        const b = generateRawResetToken();
        expect(hashResetToken(a)).not.toBe(hashResetToken(b));
    });
});
