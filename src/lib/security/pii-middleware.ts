/**
 * PII Encryption Middleware
 *
 * Prisma middleware that transparently encrypts PII on writes and decrypts on reads.
 * Uses the crypto abstraction from src/lib/security/encryption.ts.
 *
 * Architecture:
 *   - On CREATE / UPDATE: auto-populate *Encrypted and *Hash columns from plaintext
 *   - On READ: decrypt *Encrypted columns back into the plaintext field positions
 *   - Dual-write: both plaintext and encrypted columns are maintained during migration
 *
 * The middleware acts as a transparent layer — callers never see encrypted values.
 *
 * SECURITY: Never log results containing decrypted PII. The middleware itself
 * only handles the transform; it does not log field values.
 */
import { Prisma } from '@prisma/client';
import { encryptField, decryptField, hashForLookup, isEncryptedValue } from './encryption';

// ─── Field Mappings ─────────────────────────────────────────────────

/**
 * Maps model → array of { plain, encrypted, hash? } tuples.
 * Only models with APP_ENCRYPTED fields are listed.
 */
const PII_FIELD_MAP: Record<string, Array<{
    plain: string;
    encrypted: string;
    hash?: string; // only if needsSearchHash
}>> = {
    User: [
        { plain: 'email', encrypted: 'emailEncrypted', hash: 'emailHash' },
        { plain: 'name', encrypted: 'nameEncrypted' },
    ],
    VendorContact: [
        { plain: 'name', encrypted: 'nameEncrypted' },
        { plain: 'email', encrypted: 'emailEncrypted', hash: 'emailHash' },
        { plain: 'phone', encrypted: 'phoneEncrypted' },
    ],
    AuditorAccount: [
        { plain: 'email', encrypted: 'emailEncrypted', hash: 'emailHash' },
        { plain: 'name', encrypted: 'nameEncrypted' },
    ],
    NotificationOutbox: [
        { plain: 'toEmail', encrypted: 'toEmailEncrypted' },
    ],
    UserIdentityLink: [
        { plain: 'emailAtLinkTime', encrypted: 'emailAtLinkTimeEncrypted', hash: 'emailAtLinkTimeHash' },
    ],
};

// ─── Helpers ────────────────────────────────────────────────────────

function encryptOnWrite(
    data: Record<string, unknown>,
    fields: typeof PII_FIELD_MAP[string],
): void {
    for (const { plain, encrypted, hash } of fields) {
        const value = data[plain];
        if (typeof value === 'string' && value.length > 0) {
            data[encrypted] = encryptField(value);
            if (hash) {
                data[hash] = hashForLookup(value);
            }
        }
    }
}

function decryptOnRead(
    record: Record<string, unknown>,
    fields: typeof PII_FIELD_MAP[string],
): void {
    for (const { plain, encrypted } of fields) {
        const encValue = record[encrypted];
        if (typeof encValue === 'string' && isEncryptedValue(encValue)) {
            try {
                record[plain] = decryptField(encValue);
            } catch {
                // If decryption fails (key rotation, corruption), preserve plaintext
                // The plaintext column still has the original value during dual-write
            }
        }
    }
}

function decryptResult(result: unknown, model: string): unknown {
    const fields = PII_FIELD_MAP[model];
    if (!fields) return result;

    if (Array.isArray(result)) {
        for (const item of result) {
            if (item && typeof item === 'object') {
                decryptOnRead(item as Record<string, unknown>, fields);
            }
        }
    } else if (result && typeof result === 'object') {
        decryptOnRead(result as Record<string, unknown>, fields);
    }

    return result;
}

// ─── Middleware ──────────────────────────────────────────────────────

/**
 * Prisma middleware for transparent PII encryption.
 *
 * Usage:
 *   import { piiEncryptionMiddleware } from '@/lib/security/pii-middleware';
 *   prisma.$use(piiEncryptionMiddleware);
 */
export const piiEncryptionMiddleware: Prisma.Middleware = async (params, next) => {
    const fields = params.model ? PII_FIELD_MAP[params.model] : undefined;

    if (!fields) {
        return next(params);
    }

    // ─── Encrypt on write ───
    if (params.action === 'create' || params.action === 'update' || params.action === 'upsert') {
        if (params.action === 'upsert') {
            if (params.args.create && typeof params.args.create === 'object') {
                encryptOnWrite(params.args.create as Record<string, unknown>, fields);
            }
            if (params.args.update && typeof params.args.update === 'object') {
                encryptOnWrite(params.args.update as Record<string, unknown>, fields);
            }
        } else {
            // create / update
            if (params.args.data && typeof params.args.data === 'object') {
                encryptOnWrite(params.args.data as Record<string, unknown>, fields);
            }
        }
    }

    // createMany
    if (params.action === 'createMany' && Array.isArray(params.args?.data)) {
        for (const item of params.args.data) {
            if (item && typeof item === 'object') {
                encryptOnWrite(item as Record<string, unknown>, fields);
            }
        }
    }

    // ─── Execute query ───
    const result = await next(params);

    // ─── Decrypt on read ───
    const readActions = [
        'findUnique', 'findUniqueOrThrow',
        'findFirst', 'findFirstOrThrow',
        'findMany',
        'create', 'update', 'upsert',
    ];

    if (readActions.includes(params.action)) {
        return decryptResult(result, params.model!);
    }

    return result;
};

/**
 * Returns the PII field map for a specific model.
 * Useful for testing and introspection.
 * @internal
 */
export function _getPiiFieldMap(model: string) {
    return PII_FIELD_MAP[model];
}
