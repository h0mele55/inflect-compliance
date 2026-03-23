/**
 * Data Protection — Field-Level Encryption
 *
 * AES-256-GCM authenticated encryption with versioned payload format.
 * Used for PII fields (emails, names) at the application layer.
 *
 * Payload format: "v1:" + base64(iv ∥ ciphertext ∥ authTag)
 *   - iv:        12 bytes (96-bit, GCM recommended)
 *   - ciphertext: variable length
 *   - authTag:   16 bytes (128-bit)
 *
 * Key derivation: HKDF-SHA256 from DATA_ENCRYPTION_KEY env var.
 * Each purpose (field encryption vs lookup hash) gets a distinct derived key.
 *
 * SECURITY NOTES:
 * - Never log plaintext PII after decryption.
 * - Never reuse IVs (crypto.randomBytes ensures this).
 * - The version prefix ("v1:") enables future algorithm rotation.
 * - HMAC-SHA256 lookup hashes are deterministic by design — they enable
 *   WHERE clause lookups without decrypting every row.
 */
import crypto from 'crypto';

// ─── Constants ──────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm' as const;
const IV_LENGTH = 12;        // 96-bit IV (GCM recommendation)
const AUTH_TAG_LENGTH = 16;  // 128-bit auth tag
const VERSION_PREFIX = 'v1:';

// HKDF info strings — distinct per purpose to ensure key separation
const ENCRYPT_INFO = 'inflect-data-encryption';
const HMAC_INFO = 'inflect-data-lookup-hash';

// ─── Key Management ─────────────────────────────────────────────────

let _cachedEncryptKey: Buffer | null = null;
let _cachedHmacKey: Buffer | null = null;
let _lastKeySource: string | null = null;

/**
 * Gets the raw encryption key material from environment.
 * In production, DATA_ENCRYPTION_KEY is required.
 * In development/test, falls back to a deterministic dev key (logs a warning).
 */
function getRawKeyMaterial(): string {
    const key = process.env.DATA_ENCRYPTION_KEY;
    if (key && key.length >= 32) {
        return key;
    }

    const nodeEnv = process.env.NODE_ENV;
    if (nodeEnv === 'production') {
        throw new Error(
            'DATA_ENCRYPTION_KEY is required in production and must be at least 32 characters. ' +
            'Generate one with: openssl rand -base64 48'
        );
    }

    // Dev/test fallback — deterministic so tests are reproducible
    const devKey = 'inflect-dev-encryption-key-not-for-production-use!!';
    if (nodeEnv !== 'test') {
        console.warn(
            '[encryption] Using development fallback key. Set DATA_ENCRYPTION_KEY for production.'
        );
    }
    return devKey;
}

/**
 * Derives a 256-bit key via HKDF-SHA256 for the given purpose.
 */
function deriveKey(rawMaterial: string, info: string): Buffer {
    const salt = Buffer.from('inflect-data-protection-salt-v1', 'utf8');
    const ikm = Buffer.from(rawMaterial, 'utf8');
    const infoBuffer = Buffer.from(info, 'utf8');

    // HKDF-Extract
    const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
    // HKDF-Expand (single block = 32 bytes, sufficient for AES-256)
    const derived = crypto.createHmac('sha256', prk)
        .update(Buffer.concat([infoBuffer, Buffer.from([1])]))
        .digest();

    return derived; // 32 bytes = 256 bits
}

/**
 * Gets the encryption key, caching it for performance.
 * Cache is invalidated if the underlying key material changes.
 */
function getEncryptionKey(): Buffer {
    const raw = getRawKeyMaterial();
    if (_cachedEncryptKey && _lastKeySource === raw) {
        return _cachedEncryptKey;
    }
    _cachedEncryptKey = deriveKey(raw, ENCRYPT_INFO);
    _cachedHmacKey = deriveKey(raw, HMAC_INFO);
    _lastKeySource = raw;
    return _cachedEncryptKey;
}

/**
 * Gets the HMAC key for deterministic lookup hashes.
 */
function getHmacKey(): Buffer {
    const raw = getRawKeyMaterial();
    if (_cachedHmacKey && _lastKeySource === raw) {
        return _cachedHmacKey;
    }
    // Calling getEncryptionKey() populates both caches
    getEncryptionKey();
    return _cachedHmacKey!;
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Encrypts a plaintext string using AES-256-GCM.
 *
 * @param plaintext - The string to encrypt (can be empty, but not null/undefined)
 * @returns Versioned ciphertext: "v1:base64(iv ∥ ciphertext ∥ tag)"
 *
 * @example
 * const encrypted = encryptField('user@example.com');
 * // "v1:dGVzdC..." (opaque, variable length)
 */
export function encryptField(plaintext: string): string {
    if (plaintext === null || plaintext === undefined) {
        throw new Error('encryptField: plaintext must not be null or undefined');
    }

    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    // iv (12) + ciphertext (variable) + tag (16)
    const combined = Buffer.concat([iv, encrypted, tag]);
    return VERSION_PREFIX + combined.toString('base64');
}

/**
 * Decrypts an encrypted field back to plaintext.
 *
 * @param ciphertext - Versioned ciphertext from encryptField()
 * @returns Decrypted plaintext string
 * @throws Error if ciphertext is tampered, truncated, or uses unknown version
 *
 * @example
 * const email = decryptField(record.emailEncrypted);
 */
export function decryptField(ciphertext: string): string {
    if (!ciphertext || !ciphertext.startsWith(VERSION_PREFIX)) {
        throw new Error(
            'decryptField: invalid ciphertext format. Expected version prefix "v1:"'
        );
    }

    const payload = ciphertext.slice(VERSION_PREFIX.length);
    const combined = Buffer.from(payload, 'base64');

    if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
        throw new Error('decryptField: ciphertext too short (truncated?)');
    }

    const iv = combined.subarray(0, IV_LENGTH);
    const tag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH);

    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
    ]);

    return decrypted.toString('utf8');
}

/**
 * Produces a deterministic HMAC-SHA256 hash for indexed lookups.
 *
 * Use this to populate `<field>Hash` columns so you can do:
 *   WHERE emailHash = hashForLookup('user@example.com')
 * without decrypting every row.
 *
 * The input is normalised (lowercased, trimmed) before hashing to ensure
 * consistent lookups regardless of casing.
 *
 * @param value - The plaintext value to hash
 * @returns Hex-encoded HMAC-SHA256 hash (64 characters)
 *
 * @example
 * const hash = hashForLookup('User@Example.com');
 * // Same as hashForLookup('user@example.com')
 */
export function hashForLookup(value: string): string {
    if (value === null || value === undefined) {
        throw new Error('hashForLookup: value must not be null or undefined');
    }

    const normalised = value.toLowerCase().trim();
    const key = getHmacKey();
    return crypto.createHmac('sha256', key)
        .update(normalised, 'utf8')
        .digest('hex');
}

/**
 * Checks whether a string looks like an encrypted field (has version prefix).
 * Useful during migration to detect already-encrypted values.
 */
export function isEncryptedValue(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.startsWith(VERSION_PREFIX);
}

/**
 * Clears the cached keys. Useful in tests to simulate key rotation.
 * @internal
 */
export function _resetKeyCache(): void {
    _cachedEncryptKey = null;
    _cachedHmacKey = null;
    _lastKeySource = null;
}
