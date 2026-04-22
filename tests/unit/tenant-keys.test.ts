/**
 * Unit Test: Epic B.2 tenant-DEK primitives.
 *
 * Pins:
 *   - `generateDek()` produces a 32-byte buffer and never the same
 *     value twice (randomness invariant).
 *   - `wrapDek(generateDek())` → a string that `isWrappedDek()`
 *     accepts and starts with the envelope's `v1:` prefix.
 *   - `unwrapDek(wrapDek(dek))` === dek (round-trip).
 *   - Two wraps of the same DEK produce DIFFERENT ciphertexts (IV
 *     randomization working).
 *   - Length violations fail loud (not silent silent-truncate).
 *   - Unwrap rejects malformed envelopes, plaintext, and correctly-
 *     wrapped-but-wrong-length payloads.
 *   - `isWrappedDek` distinguishes wrapped DEKs from plaintext.
 *   - `generateAndWrapDek()` returns matching pair.
 */

import {
    generateDek,
    wrapDek,
    unwrapDek,
    isWrappedDek,
    generateAndWrapDek,
    DEK_LENGTH_BYTES,
    type TenantDek,
} from '@/lib/security/tenant-keys';
import { encryptField, isEncryptedValue } from '@/lib/security/encryption';

describe('generateDek', () => {
    it(`returns a Buffer of exactly ${DEK_LENGTH_BYTES} bytes`, () => {
        const dek = generateDek();
        expect(Buffer.isBuffer(dek)).toBe(true);
        expect(dek.length).toBe(DEK_LENGTH_BYTES);
    });

    it('never returns the same value twice', () => {
        const n = 100;
        const seen = new Set<string>();
        for (let i = 0; i < n; i++) {
            seen.add(generateDek().toString('hex'));
        }
        // Birthday paradox for 256-bit random: collision probability
        // over 100 samples is effectively zero. If this ever fails,
        // crypto.randomBytes is broken.
        expect(seen.size).toBe(n);
    });

    it('produces output with high bit entropy (no obvious zero patterns)', () => {
        const dek = generateDek();
        const zeros = dek.filter((b) => b === 0).length;
        // On random 32 bytes, zero-byte count is Binomial(32, 1/256),
        // E[X] = 0.125. P(X >= 4) is ~0.00015 — a test that flakes
        // < 1 in 5000 runs is fine and catches an RNG that got stuck.
        expect(zeros).toBeLessThan(4);
    });
});

describe('wrapDek', () => {
    it('produces a string in the encrypted-value envelope', () => {
        const wrapped = wrapDek(generateDek());
        expect(typeof wrapped).toBe('string');
        expect(wrapped.startsWith('v1:')).toBe(true);
        expect(isWrappedDek(wrapped)).toBe(true);
        expect(isEncryptedValue(wrapped)).toBe(true);
    });

    it('re-wrapping the SAME DEK produces DIFFERENT ciphertexts (random IV)', () => {
        const dek = generateDek();
        const a = wrapDek(dek);
        const b = wrapDek(dek);
        expect(a).not.toBe(b);
    });

    it('throws on non-Buffer input', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(() => wrapDek('not a buffer' as any)).toThrow(/must be a Buffer/);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(() => wrapDek(null as any)).toThrow();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(() => wrapDek(undefined as any)).toThrow();
    });

    it('throws on wrong length — too short', () => {
        const short = Buffer.alloc(16);
        expect(() => wrapDek(short)).toThrow(/must be exactly 32 bytes/);
    });

    it('throws on wrong length — too long', () => {
        const long = Buffer.alloc(64);
        expect(() => wrapDek(long)).toThrow(/must be exactly 32 bytes/);
    });

    it('never emits DEK material in the error message', () => {
        const sentinel = Buffer.alloc(16, 0xab); // 16 bytes of 0xab
        try {
            wrapDek(sentinel);
            throw new Error('expected wrapDek to throw');
        } catch (err) {
            const msg = (err as Error).message;
            // The error may mention the byte length (16) but NEVER
            // the bytes themselves.
            expect(msg).not.toContain('ababababab');
            expect(msg).not.toContain(sentinel.toString('hex'));
            expect(msg).not.toContain(sentinel.toString('base64'));
        }
    });
});

describe('unwrapDek', () => {
    it('round-trips: unwrap(wrap(dek)) === dek (byte-for-byte)', () => {
        const original = generateDek();
        const wrapped = wrapDek(original);
        const recovered = unwrapDek(wrapped);
        expect(recovered.equals(original)).toBe(true);
        expect(recovered.length).toBe(DEK_LENGTH_BYTES);
    });

    it('rejects plaintext (no v1: prefix)', () => {
        expect(() => unwrapDek('not a ciphertext')).toThrow(
            /not in the expected encrypted envelope/,
        );
        expect(() => unwrapDek('')).toThrow(
            /not in the expected encrypted envelope/,
        );
    });

    it('rejects a correctly-enveloped payload with the wrong decoded length', () => {
        // Wrap a 16-byte base64 string — has the right envelope but
        // decodes to 12 bytes, NOT 32.
        const fakeShort = Buffer.alloc(16).toString('base64');
        const envelope = encryptField(fakeShort);
        expect(() => unwrapDek(envelope)).toThrow(
            /decoded DEK has length/,
        );
    });

    it('rejects malformed/corrupted ciphertext (AES-GCM tag fails)', () => {
        // Valid prefix, but the ciphertext itself is gibberish that
        // cannot decrypt. decryptField throws — unwrapDek bubbles up.
        expect(() =>
            unwrapDek('v1:not-real-base64-or-ciphertext-material'),
        ).toThrow();
    });
});

describe('isWrappedDek', () => {
    it('true for real wrapped DEKs', () => {
        expect(isWrappedDek(wrapDek(generateDek()))).toBe(true);
    });

    it('false for plaintext, null, undefined, empty', () => {
        expect(isWrappedDek(null)).toBe(false);
        expect(isWrappedDek(undefined)).toBe(false);
        expect(isWrappedDek('')).toBe(false);
        expect(isWrappedDek('random plaintext')).toBe(false);
        expect(isWrappedDek('not v1 prefix')).toBe(false);
    });
});

describe('generateAndWrapDek', () => {
    it('returns matching raw + wrapped DEK', () => {
        const { dek, wrapped } = generateAndWrapDek();
        expect(dek.length).toBe(DEK_LENGTH_BYTES);
        expect(isWrappedDek(wrapped)).toBe(true);
        // The wrapped form unwraps back to the same raw bytes.
        expect(unwrapDek(wrapped).equals(dek)).toBe(true);
    });

    it('every invocation produces a distinct pair', () => {
        const a = generateAndWrapDek();
        const b = generateAndWrapDek();
        expect(a.dek.equals(b.dek)).toBe(false);
        expect(a.wrapped).not.toBe(b.wrapped);
    });
});

// ─── Key hierarchy sanity ────────────────────────────────────────────

describe('Key hierarchy integrity', () => {
    it('wrapped DEK does NOT leak the raw DEK bytes', () => {
        const dek = generateDek();
        const wrapped = wrapDek(dek);
        expect(wrapped).not.toContain(dek.toString('base64'));
        expect(wrapped).not.toContain(dek.toString('hex'));
    });

    it('envelope is larger than the raw DEK (ciphertext has IV + tag)', () => {
        const dek = generateDek();
        const wrapped = wrapDek(dek);
        // v1: prefix + base64(iv:12 + ct:~44 + tag:16) >> base64(DEK:32)
        expect(wrapped.length).toBeGreaterThan(dek.toString('base64').length);
    });

    it('two tenants share no DEK material (independent randomness)', () => {
        const tenantA: TenantDek = generateDek();
        const tenantB: TenantDek = generateDek();
        const common = Buffer.alloc(DEK_LENGTH_BYTES);
        let matches = 0;
        for (let i = 0; i < DEK_LENGTH_BYTES; i++) {
            if (tenantA[i] === tenantB[i]) matches++;
            common[i] = tenantA[i] & tenantB[i];
        }
        // E[matches] = 32 * (1/256) = 0.125. P(matches >= 4) ~ 0.00015.
        expect(matches).toBeLessThan(4);
    });
});
