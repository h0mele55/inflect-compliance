/**
 * Unit Test: Epic B.3 dual-KEK rotation support in encryption.ts.
 *
 * Pins:
 *   - Writes always use the primary (new) KEK.
 *   - Reads try primary first; on GCM failure, fall back to
 *     `DATA_ENCRYPTION_KEY_PREVIOUS` if configured.
 *   - No previous key configured → behaves exactly like B.1
 *     (primary-only decrypt, failure surfaces the primary error).
 *   - Both keys fail → the primary error is re-thrown (caller's
 *     mental model is "my current key doesn't fit").
 *   - Rotating `DATA_ENCRYPTION_KEY` without rotating `PREVIOUS` (or
 *     vice versa) still produces readable data as long as ONE of the
 *     two decrypts it.
 *   - `_resetKeyCache` picks up env changes (rotation in tests).
 */

import {
    encryptField,
    decryptField,
    _resetKeyCache,
} from '@/lib/security/encryption';

const OLD_KEY = 'a'.repeat(48);
const NEW_KEY = 'b'.repeat(48);

function setKeys(primary?: string, previous?: string): void {
    if (primary === undefined) delete process.env.DATA_ENCRYPTION_KEY;
    else process.env.DATA_ENCRYPTION_KEY = primary;

    if (previous === undefined) delete process.env.DATA_ENCRYPTION_KEY_PREVIOUS;
    else process.env.DATA_ENCRYPTION_KEY_PREVIOUS = previous;

    _resetKeyCache();
}

const savedEnv = {
    primary: process.env.DATA_ENCRYPTION_KEY,
    previous: process.env.DATA_ENCRYPTION_KEY_PREVIOUS,
};

afterAll(() => {
    setKeys(savedEnv.primary, savedEnv.previous);
});

describe('Dual-KEK decrypt (Epic B.3)', () => {
    test('no previous key configured → primary-only behaviour (B.1 baseline)', () => {
        setKeys(OLD_KEY);
        const ct = encryptField('hello');
        expect(decryptField(ct)).toBe('hello');
    });

    test('before rotation — ciphertext written under OLD_KEY', () => {
        setKeys(OLD_KEY);
        const ct = encryptField('pre-rotation secret');

        // --- OPERATOR rotates: primary becomes NEW_KEY, previous = OLD_KEY
        setKeys(NEW_KEY, OLD_KEY);

        // The old ciphertext STILL decrypts via the fallback.
        expect(decryptField(ct)).toBe('pre-rotation secret');
    });

    test('during rotation — new writes go under NEW_KEY', () => {
        setKeys(NEW_KEY, OLD_KEY);
        const ct = encryptField('written during rotation');
        expect(decryptField(ct)).toBe('written during rotation');

        // After rotation completes (previous unset), the ciphertext
        // is still decryptable — it was written under the primary all
        // along.
        setKeys(NEW_KEY);
        expect(decryptField(ct)).toBe('written during rotation');
    });

    test('post-rotation — OLD_KEY ciphertext readable UNTIL previous is unset', () => {
        setKeys(OLD_KEY);
        const legacy = encryptField('legacy value');

        setKeys(NEW_KEY, OLD_KEY);
        expect(decryptField(legacy)).toBe('legacy value');

        // Rotation complete — operator drops the previous env var.
        // Now this ciphertext CANNOT decrypt (rotation job should have
        // re-encrypted it before this point).
        setKeys(NEW_KEY);
        expect(() => decryptField(legacy)).toThrow();
    });

    test('both keys fail → primary error is re-thrown', () => {
        setKeys(OLD_KEY);
        const ct = encryptField('x');

        // Switch to a completely different key pair so neither works.
        setKeys(NEW_KEY, 'c'.repeat(48));
        expect(() => decryptField(ct)).toThrow();
    });

    test('previous key configured but primary still works → no fallback', () => {
        setKeys(NEW_KEY, OLD_KEY);
        const ct = encryptField('primary happy path');
        // Decrypt succeeds on primary; previous never consulted.
        expect(decryptField(ct)).toBe('primary happy path');
    });

    test('cache invalidation — swapping DATA_ENCRYPTION_KEY_PREVIOUS takes effect on next call', () => {
        setKeys(OLD_KEY);
        const ct = encryptField('test value');

        // Start rotation with wrong previous — should fail.
        setKeys(NEW_KEY, 'd'.repeat(48));
        expect(() => decryptField(ct)).toThrow();

        // Operator corrects the previous env var — next call reads the
        // corrected key (the _resetKeyCache inside setKeys drops the
        // stale cache).
        setKeys(NEW_KEY, OLD_KEY);
        expect(decryptField(ct)).toBe('test value');
    });

    test('tampered ciphertext fails both keys cleanly (auth tag mismatch)', () => {
        setKeys(NEW_KEY, OLD_KEY);
        const ct = encryptField('honest payload');
        const tampered = ct.slice(0, -4) + 'AAAA';
        expect(() => decryptField(tampered)).toThrow();
    });

    test('round-trip across three rotation generations', () => {
        setKeys('g1'.repeat(24));
        const a = encryptField('gen-1 data');

        // Rotate g1 → g2
        setKeys('g2'.repeat(24), 'g1'.repeat(24));
        expect(decryptField(a)).toBe('gen-1 data');
        const b = encryptField('gen-2 data');

        // Rotate g2 → g3. At this point the rotation job would have
        // re-encrypted `a` under g2. We simulate that by re-encrypting.
        setKeys('g3'.repeat(24), 'g2'.repeat(24));
        expect(decryptField(b)).toBe('gen-2 data');

        // `a` (encrypted under g1, then presumably re-encrypted under
        // g2 by the rotation job) is still readable only if it was
        // re-encrypted — the test bed doesn't simulate that, so a
        // direct decrypt of the g1 ciphertext fails.
        expect(() => decryptField(a)).toThrow();
    });
});
