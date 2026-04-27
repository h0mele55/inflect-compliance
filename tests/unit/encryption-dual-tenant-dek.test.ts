/**
 * Unit Test: dual-DEK (v2) decryption fallback in encryption.ts.
 *
 * Sibling to `encryption-dual-key.test.ts` (which covers the v1
 * master-KEK fallback). Pins the per-tenant DEK rotation read path
 * added when `rotateTenantDek` was implemented:
 *
 *   - Single-DEK path: primary alone decrypts a row encrypted under
 *     primary. Fallback never invoked.
 *   - Mid-rotation path: primary fails AES-GCM, fallback under previous
 *     succeeds. Plaintext recovered.
 *   - No previous DEK supplied: primary failure → original primary
 *     error re-thrown (caller's mental model is "my current key
 *     doesn't fit").
 *   - Both keys fail: primary error re-thrown (NOT the previous-key
 *     error). Operator debugging trusts "what's my current key?"
 *     more than "what was my old key?".
 *
 * These tests use raw key Buffers — they don't go through the
 * `tenant-key-manager` cache. That layer is covered by
 * `tenant-key-manager.test.ts`.
 */

import {
    encryptWithKey,
    decryptWithKey,
    decryptWithKeyOrPrevious,
} from '@/lib/security/encryption';
import { generateDek } from '@/lib/security/tenant-keys';

describe('decryptWithKeyOrPrevious (per-tenant dual-DEK fallback)', () => {
    test('no previous DEK + primary works → single-key behaviour', () => {
        const dek = generateDek();
        const ct = encryptWithKey(dek, 'hello');
        expect(decryptWithKeyOrPrevious(dek, null, ct)).toBe('hello');
    });

    test('mid-rotation: row written under previous DEK is recovered via fallback', () => {
        const previous = generateDek();
        const primary = generateDek();
        const ct = encryptWithKey(previous, 'pre-rotation-value');
        // Reader has BOTH keys (the encryption middleware's mid-rotation
        // state). Primary fails GCM; fallback under previous decrypts.
        expect(decryptWithKeyOrPrevious(primary, previous, ct)).toBe(
            'pre-rotation-value',
        );
    });

    test('post-rotation: same plaintext is readable directly under new primary', () => {
        const previous = generateDek();
        const primary = generateDek();
        const original = encryptWithKey(previous, 'rotated-value');
        // The sweep job decrypts under previous and rewrites under
        // primary. After rewrite, primary alone reads it.
        const decrypted = decryptWithKeyOrPrevious(primary, previous, original);
        const rewritten = encryptWithKey(primary, decrypted);
        expect(decryptWithKeyOrPrevious(primary, null, rewritten)).toBe(
            'rotated-value',
        );
    });

    test('no previous DEK supplied + primary fails → original primary error', () => {
        const dek = generateDek();
        const wrong = generateDek();
        const ct = encryptWithKey(wrong, 'opaque-payload');
        // No fallback available → throws. Same shape as decryptWithKey
        // would have thrown on its own.
        expect(() => decryptWithKeyOrPrevious(dek, null, ct)).toThrow();
        // Sanity — the same input WOULD work under the actual key.
        expect(decryptWithKey(wrong, ct)).toBe('opaque-payload');
    });

    test('both keys fail → throws the PRIMARY error, not the previous-key error', () => {
        const primary = generateDek();
        const previous = generateDek();
        // Encrypt under a third, unrelated DEK so neither primary nor
        // previous can decrypt.
        const stranger = generateDek();
        const ct = encryptWithKey(stranger, 'unreachable');

        // Capture the bare primary error so we can prove it's the one
        // surfaced by the dual-key helper.
        let primaryErr: Error | null = null;
        try {
            decryptWithKey(primary, ct);
        } catch (err) {
            primaryErr = err as Error;
        }
        expect(primaryErr).toBeTruthy();

        let dualErr: Error | null = null;
        try {
            decryptWithKeyOrPrevious(primary, previous, ct);
        } catch (err) {
            dualErr = err as Error;
        }
        expect(dualErr).toBeTruthy();
        // Same type, same message — the fallback's failure is silent
        // and we re-raise the primary's error.
        expect(dualErr!.message).toBe(primaryErr!.message);
    });

    test('cross-tenant isolation — tenant A row + tenant B keys cannot decrypt', () => {
        const tenantADek = generateDek();
        const tenantBPrimary = generateDek();
        const tenantBPrevious = generateDek();
        const aCipher = encryptWithKey(tenantADek, 'tenant-A-secret');

        expect(() =>
            decryptWithKeyOrPrevious(tenantBPrimary, tenantBPrevious, aCipher),
        ).toThrow();
    });

    test('rejects non-v2 ciphertexts (delegates the v1 envelope check)', () => {
        const dek = generateDek();
        // The underlying decryptWithKey enforces the v2: prefix; our
        // helper inherits that.
        expect(() =>
            decryptWithKeyOrPrevious(dek, null, 'v1:something'),
        ).toThrow();
    });
});
