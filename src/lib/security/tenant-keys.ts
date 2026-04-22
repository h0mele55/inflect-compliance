/**
 * Epic B.2 — Per-tenant Data Encryption Key (DEK) primitives.
 *
 * Three operations:
 *   - `generateDek()`  — cryptographically random 256-bit key (Buffer)
 *   - `wrapDek(dek)`   — encrypt the DEK under the global KEK, for
 *                        at-rest storage on `Tenant.encryptedDek`
 *   - `unwrapDek(ct)`  — reverse of wrapDek, returns the raw DEK
 *
 * ## Key hierarchy
 *
 * ```
 *   DATA_ENCRYPTION_KEY env var           (root secret, operator-managed)
 *           │
 *           ▼  HKDF-SHA256 (existing getEncryptionKey)
 *   Global KEK                            (256-bit, cached in-process)
 *           │
 *           ▼  AES-256-GCM(plaintext = base64(DEK))
 *   Wrapped DEK on Tenant.encryptedDek    (one row per tenant)
 *           │
 *           ▼  Runtime unwrap (future integration)
 *   Per-tenant DEK (Buffer, 32 bytes)
 *           │
 *           ▼  AES-256-GCM (on every encrypted field write/read)
 *   Field ciphertext
 * ```
 *
 * ## Design decisions
 *
 * - **Reuse `encryptField` for wrapping.** A separate HKDF-derived
 *   "key-wrapping key" would add a layer of key-purpose separation,
 *   but it doesn't help if the operator's `DATA_ENCRYPTION_KEY` is
 *   compromised (the root secret deriving all downstream keys is the
 *   same). AES-256-GCM with random IVs is already safe under the
 *   same key for millions of messages. Keep the primitive surface
 *   minimal; introduce a KWK derivation only when we move the root
 *   secret into a KMS.
 *
 * - **Base64-encode the DEK before wrapping.** `encryptField()`
 *   operates on strings — so the 32 raw bytes get base64'd. The
 *   unwrap pairs `decryptField()` with `Buffer.from(…, 'base64')`
 *   to recover the original bytes.
 *
 * - **Strict length validation.** A DEK that isn't exactly 32 bytes
 *   is an invariant violation — fail loud, don't silently accept.
 *
 * - **Envelope versioning is inherited.** The `v1:` prefix from
 *   `encryptField()` is already on the stored ciphertext. When the
 *   master KEK rotates, the envelope upgrades to `v2:…` without
 *   changing this module's public contract.
 *
 * ## What this file does NOT do
 *
 * - **Persist the DEK.** Writing to `Tenant.encryptedDek` is the
 *   caller's job — typically `scripts/backfill-tenant-deks.ts` (for
 *   existing tenants) and the tenant-creation usecase (for new
 *   ones). Both land in a follow-up prompt.
 *
 * - **Cache unwrapped DEKs.** The runtime integration phase adds a
 *   per-request tenant-DEK cache alongside `runInTenantContext` so
 *   the AES-GCM key is available without a `decryptField()` call
 *   per field. This module returns raw buffers; the cache lives
 *   elsewhere.
 *
 * - **Use the DEK for field encryption.** The Epic B.1 middleware
 *   still calls `encryptField()` (which uses the global KEK). Once
 *   the runtime integration lands, it will switch to a per-tenant
 *   `encryptFieldWithDek(dek, plaintext)` primitive and the
 *   middleware will resolve the DEK from request context.
 */

import crypto from 'crypto';
import {
    encryptField,
    decryptField,
    isEncryptedValue,
} from './encryption';

// ─── Types ──────────────────────────────────────────────────────────

/**
 * A raw Data Encryption Key — 32 bytes (256-bit). Never persisted in
 * this form; exists only in-memory between unwrap and use.
 */
export type TenantDek = Buffer;

/**
 * The at-rest form of a DEK — a string in the `encryptField`
 * envelope (`v1:base64(...)`), stored on `Tenant.encryptedDek`.
 * Distinguishable from plaintext via `isWrappedDek()`.
 */
export type WrappedDek = string;

/** AES-256 key length in bytes. */
export const DEK_LENGTH_BYTES = 32;

// ─── Primitives ─────────────────────────────────────────────────────

/**
 * Generate a fresh per-tenant DEK.
 *
 * Uses `crypto.randomBytes` (same source as every other key in this
 * codebase). 32 bytes = 256 bits of entropy, which matches the AES-256
 * key size and satisfies NIST SP 800-133 key-generation requirements.
 *
 * **Never log the returned value.** The DEK bytes are as sensitive as
 * the plaintext they will protect.
 */
export function generateDek(): TenantDek {
    return crypto.randomBytes(DEK_LENGTH_BYTES);
}

/**
 * Wrap a raw DEK under the global KEK for storage on
 * `Tenant.encryptedDek`.
 *
 * @throws if `dek` is not exactly `DEK_LENGTH_BYTES` bytes.
 */
export function wrapDek(dek: TenantDek): WrappedDek {
    if (!Buffer.isBuffer(dek)) {
        throw new Error('wrapDek: DEK must be a Buffer');
    }
    if (dek.length !== DEK_LENGTH_BYTES) {
        throw new Error(
            `wrapDek: DEK must be exactly ${DEK_LENGTH_BYTES} bytes, got ${dek.length}`,
        );
    }
    // encryptField takes a string — base64 gives a lossless string
    // view of the raw bytes. The decode path in unwrapDek reverses.
    return encryptField(dek.toString('base64'));
}

/**
 * Unwrap a stored DEK back to raw bytes for use as an AES-256-GCM key.
 *
 * @throws if the input isn't in the expected envelope or decodes to
 *         the wrong byte length (indicates corruption or a key mismatch).
 */
export function unwrapDek(wrapped: WrappedDek): TenantDek {
    if (!isEncryptedValue(wrapped)) {
        throw new Error(
            'unwrapDek: value is not in the expected encrypted envelope',
        );
    }
    const encoded = decryptField(wrapped);
    const dek = Buffer.from(encoded, 'base64');
    if (dek.length !== DEK_LENGTH_BYTES) {
        // `Buffer.from` silently produces a too-short buffer on
        // invalid base64 input. Length check catches that AND the
        // rare case of a mis-keyed unwrap that happened to produce a
        // valid base64 string.
        throw new Error(
            `unwrapDek: decoded DEK has length ${dek.length}, expected ${DEK_LENGTH_BYTES}`,
        );
    }
    return dek;
}

/**
 * Predicate — does this string look like a stored wrapped DEK?
 * Thin alias for `isEncryptedValue()` that reads better at call
 * sites working with tenant-key payloads specifically.
 */
export function isWrappedDek(value: string | null | undefined): boolean {
    return isEncryptedValue(value);
}

/**
 * Convenience — generate AND wrap in one call. Returns both the raw
 * DEK (for immediate use if the caller wants to seed a key cache)
 * and the wrapped form (for persistence).
 *
 * The caller is responsible for persisting `wrapped` and zeroing
 * `dek` after use (zeroing is a future hardening concern — Node's
 * GC makes it best-effort regardless).
 */
export function generateAndWrapDek(): {
    dek: TenantDek;
    wrapped: WrappedDek;
} {
    const dek = generateDek();
    const wrapped = wrapDek(dek);
    return { dek, wrapped };
}
