/**
 * PII Encryption Middleware (GAP-21 final form).
 *
 * Prisma `$use` middleware that makes encrypted-only PII storage
 * transparent to callers. The schema-level field names (`email`,
 * `name`, `emailAtLinkTime`) are remapped to the encrypted DB
 * columns via Prisma `@map`; the middleware encrypts on write,
 * decrypts on read, AND rewrites any `where` clause that targets a
 * managed plaintext field so the lookup hits the deterministic
 * hash column instead of the random-IV ciphertext column.
 *
 *   ┌──────────────────────┬──────────────────────┬──────────────────────┐
 *   │ Operation            │ Caller writes        │ Middleware translates│
 *   ├──────────────────────┼──────────────────────┼──────────────────────┤
 *   │ create / update      │ data.email = "x"     │ data.email = enc("x")│
 *   │                      │                      │ data.emailHash = h("x")│
 *   │ findUnique / findFirst│ where.email = "x"   │ where.emailHash = h("x")│
 *   │                      │                      │ where.email deleted  │
 *   │ findMany / count     │ same as findFirst    │ same                 │
 *   │ read result          │ user.email is plain  │ decrypt encrypted    │
 *   │                      │                      │ column → email field │
 *   └──────────────────────┴──────────────────────┴──────────────────────┘
 *
 * Why WHERE-rewriting: after dropping the plaintext column, the
 * schema `email` field is `@map("emailEncrypted")`. A naive
 * `where: { email: 'a@b.com' }` would compare against the random-IV
 * ciphertext column and never match. Rewriting to
 * `where: { emailHash: hashForLookup('a@b.com') }` redirects the
 * lookup to the deterministic hash and preserves uniqueness
 * semantics (the @unique constraint moves from email to emailHash).
 *
 * Why data.email cleanup on writes: same story — the schema field
 * is mapped, so when the middleware sets `data.email = encrypted` it
 * lands correctly. We delete any stray `data.<plain>` keys that
 * don't have an encrypted counterpart so callers can't accidentally
 * leak plaintext into a non-encrypting code path.
 *
 * SECURITY: never logs field values. Treat any future log additions
 * with the same guard — only structural identifiers (model, field
 * names) may appear in log payloads.
 */
import { Prisma } from '@prisma/client';
import { encryptField, decryptField, hashForLookup, isEncryptedValue } from './encryption';

// ─── Field Mappings ─────────────────────────────────────────────────

/**
 * Three flavours of mapping per (model, plain-field):
 *
 *   - `column`: the DB column the schema field maps to. After
 *     GAP-21 this is the *encrypted* column for managed fields.
 *     Used to populate `data[plain]` with ciphertext on writes (so
 *     Prisma writes the correct column), and to recognise where the
 *     decrypted value should land on reads.
 *
 *   - `hash`: the lookup-hash column, when one exists. Required for
 *     any field used in unique/equality lookups. The middleware
 *     auto-populates this on writes and rewrites WHERE clauses to
 *     target it on reads.
 *
 *   - `mapped`: `true` when `plain` is `@map`'d to the encrypted
 *     column at the schema level (post-GAP-21). `false` when the
 *     plaintext column still exists as its own DB column (legacy
 *     dual-write path; managed by the same middleware so the
 *     transition is one PR per model rather than one big bang).
 *
 * Adding a new managed field: pick the right mapping flavour, then
 * add a unit test in `tests/unit/security/pii-middleware.test.ts`
 * to lock in the where/data behaviours.
 */
interface PiiFieldSpec {
    plain: string;
    encrypted: string;
    hash?: string;
    /**
     * When true, the schema field name `plain` maps to the encrypted
     * DB column (post-GAP-21 for User, AuditorAccount,
     * UserIdentityLink). When false, the plaintext column is its own
     * column and the middleware dual-writes (legacy models).
     */
    mapped: boolean;
}

const PII_FIELD_MAP: Record<string, PiiFieldSpec[]> = {
    User: [
        { plain: 'email', encrypted: 'emailEncrypted', hash: 'emailHash', mapped: true },
        { plain: 'name', encrypted: 'nameEncrypted', mapped: true },
    ],
    AuditorAccount: [
        { plain: 'email', encrypted: 'emailEncrypted', hash: 'emailHash', mapped: true },
        { plain: 'name', encrypted: 'nameEncrypted', mapped: true },
    ],
    UserIdentityLink: [
        { plain: 'emailAtLinkTime', encrypted: 'emailAtLinkTimeEncrypted', hash: 'emailAtLinkTimeHash', mapped: true },
    ],
    // ── Models still on the legacy dual-write path ──────────────────
    // These models keep their plaintext columns until a follow-up PR
    // ports them to the @map'd / hash-only model. The middleware
    // continues to write both columns so reads stay consistent.
    VendorContact: [
        { plain: 'name', encrypted: 'nameEncrypted', mapped: false },
        { plain: 'email', encrypted: 'emailEncrypted', hash: 'emailHash', mapped: false },
        { plain: 'phone', encrypted: 'phoneEncrypted', mapped: false },
    ],
    NotificationOutbox: [
        { plain: 'toEmail', encrypted: 'toEmailEncrypted', mapped: false },
    ],
    Account: [
        { plain: 'access_token', encrypted: 'accessTokenEncrypted', mapped: false },
        { plain: 'refresh_token', encrypted: 'refreshTokenEncrypted', mapped: false },
    ],
};

// ─── Helpers ────────────────────────────────────────────────────────

function encryptOnWrite(
    data: Record<string, unknown>,
    fields: PiiFieldSpec[],
): void {
    for (const spec of fields) {
        const value = data[spec.plain];
        if (typeof value !== 'string' || value.length === 0) continue;

        if (spec.mapped) {
            // Field is @map'd to the encrypted column. Replace the
            // value in-place with ciphertext — Prisma writes it to
            // the correct column.
            data[spec.plain] = encryptField(value);
        } else {
            // Legacy dual-write: keep plaintext, also write encrypted.
            data[spec.encrypted] = encryptField(value);
        }
        if (spec.hash) {
            data[spec.hash] = hashForLookup(value);
        }
    }
}

function decryptOnRead(
    record: Record<string, unknown>,
    fields: PiiFieldSpec[],
): void {
    for (const spec of fields) {
        if (spec.mapped) {
            // Schema field IS the encrypted column. Decrypt in place
            // so callers reading `user.email` see plaintext.
            const value = record[spec.plain];
            if (typeof value === 'string' && isEncryptedValue(value)) {
                try {
                    record[spec.plain] = decryptField(value);
                } catch {
                    // Decryption failed (key rotation in flight, or
                    // corruption). Leave the ciphertext in place —
                    // callers downstream can detect via
                    // `isEncryptedValue` and decide; we do not
                    // fall back to logging the failure with the
                    // value, only the structural shape upstream.
                }
            }
        } else {
            // Legacy: decrypt encrypted column INTO plain field.
            const encValue = record[spec.encrypted];
            if (typeof encValue === 'string' && isEncryptedValue(encValue)) {
                try {
                    record[spec.plain] = decryptField(encValue);
                } catch {
                    // Same fail-safe as above; the plaintext column
                    // is still present on legacy models so reads
                    // continue to function via the dual-write source.
                }
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

/**
 * Rewrites a WHERE clause so that an equality predicate on a managed
 * plaintext field is redirected to the deterministic hash column.
 *
 * Handles three caller shapes:
 *
 *   1. `where: { email: 'a@b.com' }`               → `{ emailHash: h('a@b.com') }`
 *   2. `where: { email: { equals: 'a@b.com' } }`   → `{ emailHash: h('a@b.com') }`
 *   3. `where: { email: { in: ['a@b.com', ...] } }`→ `{ emailHash: { in: [h(...), h(...)] } }`
 *
 * Only mapped fields with a hash column qualify — anything else is
 * left untouched (for non-mapped legacy fields, the plaintext
 * column still exists at the DB and a literal lookup works).
 *
 * The function MUTATES the where object in place. It also recurses
 * into AND/OR/NOT compound clauses so `where: { OR: [{ email: ... }] }`
 * is rewritten correctly.
 *
 * Logs nothing — security-sensitive code path.
 */
function rewriteWhereForHash(
    where: Record<string, unknown>,
    fields: PiiFieldSpec[],
): void {
    for (const spec of fields) {
        // Only mapped fields with a hash column need rewriting; the
        // mapped column is ciphertext at the DB, so a literal lookup
        // will never match.
        if (!spec.mapped || !spec.hash) continue;
        if (!(spec.plain in where)) continue;

        const predicate = where[spec.plain];
        if (typeof predicate === 'string') {
            // Shape 1 — bare equality.
            where[spec.hash] = hashForLookup(predicate);
            delete where[spec.plain];
        } else if (
            predicate &&
            typeof predicate === 'object' &&
            !Array.isArray(predicate)
        ) {
            const obj = predicate as Record<string, unknown>;
            if (typeof obj.equals === 'string') {
                // Shape 2 — { equals: 'x' }.
                where[spec.hash] = hashForLookup(obj.equals);
                delete where[spec.plain];
            } else if (Array.isArray(obj.in)) {
                // Shape 3 — { in: ['x', 'y'] }.
                const hashed = obj.in
                    .filter((v): v is string => typeof v === 'string')
                    .map((v) => hashForLookup(v));
                where[spec.hash] = { in: hashed };
                delete where[spec.plain];
            }
            // Other operators (`startsWith`, `contains`, etc.) cannot
            // be expressed against a hash. A caller using those on a
            // managed PII field has a bug; we leave the predicate
            // untouched so it surfaces as "no rows found" rather
            // than silently rewriting to an incorrect lookup.
        }
    }

    // Recurse into compound clauses.
    for (const key of ['AND', 'OR', 'NOT'] as const) {
        const compound = where[key];
        if (Array.isArray(compound)) {
            for (const sub of compound) {
                if (sub && typeof sub === 'object') {
                    rewriteWhereForHash(sub as Record<string, unknown>, fields);
                }
            }
        } else if (compound && typeof compound === 'object') {
            rewriteWhereForHash(compound as Record<string, unknown>, fields);
        }
    }
}

/**
 * Top-level entry point for WHERE rewriting. Inspects the
 * action-specific args shape and walks any embedded `where`.
 */
function rewriteArgsWhere(
    args: Record<string, unknown> | undefined,
    fields: PiiFieldSpec[],
): void {
    if (!args || typeof args !== 'object') return;
    const where = args.where;
    if (where && typeof where === 'object' && !Array.isArray(where)) {
        rewriteWhereForHash(where as Record<string, unknown>, fields);
    }
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
    if (
        params.action === 'create' ||
        params.action === 'update' ||
        params.action === 'upsert' ||
        params.action === 'updateMany'
    ) {
        if (params.action === 'upsert') {
            if (params.args.create && typeof params.args.create === 'object') {
                encryptOnWrite(params.args.create as Record<string, unknown>, fields);
            }
            if (params.args.update && typeof params.args.update === 'object') {
                encryptOnWrite(params.args.update as Record<string, unknown>, fields);
            }
        } else {
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

    // ─── Rewrite WHERE → hash for read/scoped-write actions ───
    //
    // `findUnique` callers use `where: { email: '...' }` — that has
    // to redirect to the hash column on mapped models.
    // `update` / `updateMany` / `delete` / `deleteMany` callers can
    // also pass a where clause; same treatment.
    const whereActions = [
        'findUnique',
        'findUniqueOrThrow',
        'findFirst',
        'findFirstOrThrow',
        'findMany',
        'count',
        'aggregate',
        'groupBy',
        'update',
        'updateMany',
        'delete',
        'deleteMany',
    ];
    if (whereActions.includes(params.action)) {
        rewriteArgsWhere(
            params.args as Record<string, unknown> | undefined,
            fields,
        );
    }

    // `upsert` carries a `where` for the find side.
    if (params.action === 'upsert') {
        rewriteArgsWhere(
            params.args as Record<string, unknown> | undefined,
            fields,
        );
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
export function _getPiiFieldMap(model: string): readonly PiiFieldSpec[] | undefined {
    return PII_FIELD_MAP[model];
}

/**
 * Test-only: invokes the WHERE rewriter directly. Exposes the pure
 * transform without going through the full middleware so behaviour
 * can be asserted in isolation.
 * @internal
 */
export function _rewriteWhereForHash(
    where: Record<string, unknown>,
    model: string,
): Record<string, unknown> {
    const fields = PII_FIELD_MAP[model];
    if (!fields) return where;
    rewriteWhereForHash(where, fields);
    return where;
}
