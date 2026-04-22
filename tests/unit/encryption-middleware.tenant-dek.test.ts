/**
 * Unit Test: Epic B.2 tenant-DEK integration in the encryption middleware.
 *
 * Builds on the Epic B.1 baseline (existing
 * `encryption-middleware.test.ts`) to pin the v2 / tenant-DEK behaviour:
 *
 *   - With an audit-context tenantId, writes produce **v2** ciphertext
 *     using the tenant's DEK.
 *   - Without context, writes fall back to **v1** under the global KEK.
 *   - Reads dispatch per-value: v1 → global KEK, v2 → tenant DEK.
 *   - **Cross-tenant isolation**: tenant A's v2 ciphertext is NOT
 *     decryptable with tenant B's DEK; the middleware catches the
 *     GCM failure, logs a warning, and returns the raw ciphertext.
 *   - Bypass sources (seed / job / system) fall back to v1 so
 *     cross-tenant sweeps don't end up encrypting under the wrong
 *     tenant's DEK.
 *   - `Tenant` model queries never resolve a DEK (recursion guard).
 *   - Mixed v1/v2 rows in a single result are handled correctly.
 */

jest.mock('@/lib/observability/logger', () => ({
    logger: {
        warn: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        debug: jest.fn(),
    },
}));

// Mock the audit-context stack so we can script tenant context for
// specific tests without spinning up the real request pipeline.
const currentAuditCtx: { tenantId?: string; source?: string } = {};
jest.mock('@/lib/audit-context', () => ({
    getAuditContext: () => ({ ...currentAuditCtx }),
}));

// Mock the tenant key manager. We script DEKs per tenantId so the
// test can ask "did we encrypt under tenant A's key?" by attempting
// a decrypt with the same DEK.
const tenantDekMap = new Map<string, Buffer>();
const getTenantDekMock = jest.fn(async (tenantId: string) => {
    const dek = tenantDekMap.get(tenantId);
    if (!dek) throw new Error(`no DEK for ${tenantId}`);
    return dek;
});
jest.mock('@/lib/security/tenant-key-manager', () => ({
    getTenantDek: (tenantId: string) => getTenantDekMock(tenantId),
}));

import {
    encryptField,
    encryptWithKey,
    decryptField,
    decryptWithKey,
    getCiphertextVersion,
    isEncryptedValue,
} from '@/lib/security/encryption';
import { generateDek } from '@/lib/security/tenant-keys';
import { _internals } from '@/lib/db/encryption-middleware';
import { logger } from '@/lib/observability/logger';

const { walkWriteArgument, walkReadResult, resolveTenantDek } = _internals;

// Small helper — run a block with a specific audit context in play,
// then reset. Keeps tests independent of ordering.
async function withAuditCtx<T>(
    ctx: { tenantId?: string; source?: string },
    fn: () => Promise<T> | T,
): Promise<T> {
    Object.assign(currentAuditCtx, ctx);
    try {
        return await fn();
    } finally {
        delete currentAuditCtx.tenantId;
        delete currentAuditCtx.source;
    }
}

beforeEach(() => {
    tenantDekMap.clear();
    getTenantDekMock.mockClear();
    jest.clearAllMocks();
    delete currentAuditCtx.tenantId;
    delete currentAuditCtx.source;
});

describe('resolveTenantDek (middleware hook)', () => {
    it('returns null when no audit context is set (v1 fallback)', async () => {
        const dek = await resolveTenantDek('Risk');
        expect(dek).toBeNull();
    });

    it('returns null for Tenant model regardless of context (recursion guard)', async () => {
        tenantDekMap.set('tenant-A', generateDek());
        await withAuditCtx({ tenantId: 'tenant-A', source: 'api' }, async () => {
            const dek = await resolveTenantDek('Tenant');
            expect(dek).toBeNull();
        });
        // Most importantly — we never called the key manager.
        expect(getTenantDekMock).not.toHaveBeenCalled();
    });

    it.each(['seed', 'job', 'system'])(
        'returns null for bypass source=%s (v1 fallback, multi-tenant scoped code)',
        async (source) => {
            tenantDekMap.set('tenant-A', generateDek());
            await withAuditCtx(
                { tenantId: 'tenant-A', source },
                async () => {
                    expect(await resolveTenantDek('Risk')).toBeNull();
                },
            );
            expect(getTenantDekMock).not.toHaveBeenCalled();
        },
    );

    it('returns the tenant DEK when audit context is a regular api request', async () => {
        const dek = generateDek();
        tenantDekMap.set('tenant-A', dek);
        await withAuditCtx({ tenantId: 'tenant-A', source: 'api' }, async () => {
            const resolved = await resolveTenantDek('Risk');
            expect(resolved).not.toBeNull();
            expect(resolved!.equals(dek)).toBe(true);
        });
    });

    it('returns null + logs warn when the key manager throws', async () => {
        // No DEK set → mock throws.
        await withAuditCtx({ tenantId: 'tenant-missing', source: 'api' }, async () => {
            const resolved = await resolveTenantDek('Risk');
            expect(resolved).toBeNull();
        });
        expect(logger.warn).toHaveBeenCalledWith(
            'encryption-middleware.dek_resolve_failed',
            expect.objectContaining({ tenantId: 'tenant-missing' }),
        );
    });
});

describe('write path — v2 when DEK present, v1 fallback otherwise', () => {
    it('with a tenant DEK, writes produce v2 ciphertext', () => {
        const dek = generateDek();
        const data = { treatmentNotes: 'secret-notes' };
        walkWriteArgument(data, 'Risk', dek);
        expect(getCiphertextVersion(data.treatmentNotes as string)).toBe('v2');
        // Round-trip under the tenant DEK recovers the plaintext.
        expect(decryptWithKey(dek, data.treatmentNotes as string)).toBe(
            'secret-notes',
        );
    });

    it('without a tenant DEK (null), writes produce v1 ciphertext', () => {
        const data = { treatmentNotes: 'fallback-notes' };
        walkWriteArgument(data, 'Risk', null);
        expect(getCiphertextVersion(data.treatmentNotes as string)).toBe('v1');
        expect(decryptField(data.treatmentNotes as string)).toBe(
            'fallback-notes',
        );
    });

    it('nested writes inherit the DEK (comments under a Task create)', () => {
        const dek = generateDek();
        const data = {
            title: 'plain-title',
            description: 'parent-desc',
            comments: {
                create: [{ body: 'c1' }, { body: 'c2' }],
            },
        };
        walkWriteArgument(data, 'Task', dek);
        expect(getCiphertextVersion(data.description as string)).toBe('v2');
        const comments = (data.comments as { create: Array<{ body: string }> })
            .create;
        for (const c of comments) {
            expect(getCiphertextVersion(c.body)).toBe('v2');
            expect(decryptWithKey(dek, c.body)).toMatch(/^c[12]$/);
        }
    });

    it('is idempotent — a value that is already v2 is not double-encrypted', () => {
        const dek = generateDek();
        const already = encryptWithKey(dek, 'already encrypted');
        const data = { treatmentNotes: already };
        walkWriteArgument(data, 'Risk', dek);
        expect(data.treatmentNotes).toBe(already);
    });

    it('is idempotent — a value that is already v1 is not double-encrypted with v2', () => {
        const dek = generateDek();
        const alreadyV1 = encryptField('v1 legacy value');
        const data = { treatmentNotes: alreadyV1 };
        walkWriteArgument(data, 'Risk', dek);
        // Still v1 — mixed-state tolerance.
        expect(data.treatmentNotes).toBe(alreadyV1);
    });
});

describe('read path — per-value dispatch on v1 / v2', () => {
    it('decrypts v2 with the supplied tenant DEK', () => {
        const dek = generateDek();
        const node = {
            treatmentNotes: encryptWithKey(dek, 'notes-under-v2'),
        };
        walkReadResult(node, 'Risk', dek);
        expect(node.treatmentNotes).toBe('notes-under-v2');
    });

    it('decrypts v1 using the global KEK, regardless of the supplied DEK', () => {
        const dek = generateDek();
        const node = {
            treatmentNotes: encryptField('legacy-v1-value'),
        };
        walkReadResult(node, 'Risk', dek);
        expect(node.treatmentNotes).toBe('legacy-v1-value');
    });

    it('handles MIXED v1 + v2 rows in a single findMany result', () => {
        const dek = generateDek();
        const rows = [
            { treatmentNotes: encryptField('v1-row') },
            { treatmentNotes: encryptWithKey(dek, 'v2-row') },
            { treatmentNotes: null },
            { treatmentNotes: 'pre-encryption plaintext legacy' },
        ];
        walkReadResult(rows, 'Risk', dek);
        expect(rows[0].treatmentNotes).toBe('v1-row');
        expect(rows[1].treatmentNotes).toBe('v2-row');
        expect(rows[2].treatmentNotes).toBeNull();
        expect(rows[3].treatmentNotes).toBe(
            'pre-encryption plaintext legacy',
        );
    });

    it('included relations inherit the DEK on recursive decrypt', () => {
        const dek = generateDek();
        const row = {
            description: encryptWithKey(dek, 'parent-desc'),
            comments: [
                { body: encryptWithKey(dek, 'comment-1') },
                { body: encryptWithKey(dek, 'comment-2') },
            ],
        };
        walkReadResult(row, 'Task', dek);
        expect(row.description).toBe('parent-desc');
        expect(row.comments[0].body).toBe('comment-1');
        expect(row.comments[1].body).toBe('comment-2');
    });

    it('v2 with no DEK available — logs warn, returns raw (never throws)', () => {
        const dek = generateDek();
        const node = {
            treatmentNotes: encryptWithKey(dek, 'should-not-decrypt'),
        };
        // Pass null — simulates a cross-tenant bypass read.
        expect(() => walkReadResult(node, 'Risk', null)).not.toThrow();
        // Value preserved (still ciphertext).
        expect(getCiphertextVersion(node.treatmentNotes as string)).toBe('v2');
        expect(logger.warn).toHaveBeenCalledWith(
            'encryption-middleware.decrypt_failed',
            expect.objectContaining({
                version: 'v2',
                field: 'treatmentNotes',
            }),
        );
    });
});

describe('cross-tenant isolation', () => {
    it("tenant A's v2 ciphertext is NOT decryptable with tenant B's DEK", () => {
        const dekA = generateDek();
        const dekB = generateDek();
        expect(dekA.equals(dekB)).toBe(false); // sanity

        const aCipher = encryptWithKey(dekA, 'tenant-A-secret');
        const node = { treatmentNotes: aCipher };

        // Reader has tenant B's DEK only — GCM tag should fail.
        walkReadResult(node, 'Risk', dekB);

        // Ciphertext preserved (decryption failed safely).
        expect(node.treatmentNotes).toBe(aCipher);
        expect(logger.warn).toHaveBeenCalledWith(
            'encryption-middleware.decrypt_failed',
            expect.objectContaining({ version: 'v2' }),
        );
    });

    it('two tenants writing the same plaintext produce different ciphertexts', () => {
        const dekA = generateDek();
        const dekB = generateDek();
        const plaintext = 'identical value';
        const a = { treatmentNotes: plaintext };
        const b = { treatmentNotes: plaintext };
        walkWriteArgument(a, 'Risk', dekA);
        walkWriteArgument(b, 'Risk', dekB);
        expect(a.treatmentNotes).not.toBe(b.treatmentNotes);
        // Each is only decryptable with its own DEK.
        expect(decryptWithKey(dekA, a.treatmentNotes as string)).toBe(plaintext);
        expect(decryptWithKey(dekB, b.treatmentNotes as string)).toBe(plaintext);
        // Swapping keys does NOT produce plaintext — verified by the
        // GCM auth failure (thrown by decryptWithKey, not swallowed).
        expect(() =>
            decryptWithKey(dekA, b.treatmentNotes as string),
        ).toThrow();
    });

    it('isEncryptedValue recognises BOTH v1 and v2 so idempotency gates work across tenants', () => {
        const dekA = generateDek();
        const v1 = encryptField('v1');
        const v2 = encryptWithKey(dekA, 'v2');
        expect(isEncryptedValue(v1)).toBe(true);
        expect(isEncryptedValue(v2)).toBe(true);
        expect(isEncryptedValue('not an envelope')).toBe(false);
        expect(isEncryptedValue(null)).toBe(false);
    });
});

describe('never leaks DEK material or plaintext in logs', () => {
    it('decrypt failure logs carry no plaintext and no DEK bytes', () => {
        const dek = generateDek();
        const plaintext = 'SECRET_SAUCE_xyz_123';
        const node = {
            // v2 ciphertext, but we pass a different DEK to force a
            // GCM tag failure.
            treatmentNotes: encryptWithKey(dek, plaintext),
        };
        const wrongDek = generateDek();
        walkReadResult(node, 'Risk', wrongDek);

        // Every warn call should be value-free.
        const allLogs = JSON.stringify(
            (logger.warn as jest.Mock).mock.calls,
        );
        expect(allLogs).not.toContain(plaintext);
        expect(allLogs).not.toContain(dek.toString('hex'));
        expect(allLogs).not.toContain(dek.toString('base64'));
        expect(allLogs).not.toContain(wrongDek.toString('hex'));
    });
});
