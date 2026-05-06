/* eslint-disable @typescript-eslint/no-explicit-any -- test
 * mocks, fixtures, and adapter shims that mirror runtime contracts
 * (Prisma extensions, NextRequest mocks, JSON-loaded fixtures,
 * spy harnesses). Per-line typing has poor cost/benefit ratio in
 * test files; the file-level disable is the codebase's standard
 * pattern for these surfaces (see also
 * tests/guards/helm-chart-foundation.test.ts and
 * tests/integration/audit-middleware.test.ts). */
/**
 * Unit tests for src/app-layer/usecases/api-keys.ts
 *
 * Wave 2 of GAP-02. Existing coverage covers happy-path creation;
 * this file adds the load-bearing security behaviours not yet
 * tested:
 *   1. Plaintext key returned ONCE at creation, never re-readable.
 *   2. Permission gate on every CRUD verb.
 *   3. Expiry must be future-dated; bad date strings rejected.
 *   4. Scope validation rejects unknown scopes — prevents an admin
 *      from minting a key with `risks.create` if `risks.create` isn't
 *      a valid scope name (typo would silently grant nothing).
 *   5. Audit emits `API_KEY_CREATED` with the scopes set, never the
 *      plaintext or hash.
 *   6. Revoke is tenant-scoped — admin in tenant A cannot revoke a
 *      key belonging to tenant B even with its id.
 */

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(async (_ctx, fn) => {
        const fakeDb = {
            tenantApiKey: {
                create: jest.fn().mockResolvedValue({
                    id: 'key-1',
                    name: 'test',
                    keyPrefix: 'inf_',
                    scopes: ['risks.read'],
                    expiresAt: null,
                    createdAt: new Date(),
                }),
                findFirst: jest.fn(),
                update: jest.fn(),
                findMany: jest.fn().mockResolvedValue([]),
            },
        };
        return fn(fakeDb);
    }),
}));

jest.mock('@/lib/auth/api-key-auth', () => ({
    generateApiKey: jest.fn(() => ({
        plaintext: 'inf_key_secret_value_xyz',
        keyHash: 'hashed-blob',
        keyPrefix: 'inf_key_',
    })),
    validateScopes: jest.fn(() => []),
}));

jest.mock('../../../src/app-layer/events/audit', () => ({
    logEvent: jest.fn().mockResolvedValue(undefined),
}));

import {
    createApiKey,
    revokeApiKey,
    listApiKeys,
} from '@/app-layer/usecases/api-keys';
import { runInTenantContext } from '@/lib/db-context';
import { validateScopes } from '@/lib/auth/api-key-auth';
import { logEvent } from '@/app-layer/events/audit';
import { makeRequestContext } from '../../helpers/make-context';

const mockRunInTx = runInTenantContext as jest.MockedFunction<typeof runInTenantContext>;
const mockValidate = validateScopes as jest.MockedFunction<typeof validateScopes>;
const mockLog = logEvent as jest.MockedFunction<typeof logEvent>;

beforeEach(() => {
    jest.clearAllMocks();
    mockValidate.mockReturnValue([]);
});

describe('createApiKey', () => {
    const validInput = { name: 'my-key', scopes: ['risks.read'] };

    it('returns the plaintext key in the result on creation (only chance to grab it)', async () => {
        mockRunInTx.mockImplementationOnce(async (_ctx, fn) => {
            const fakeDb = {
                tenantApiKey: {
                    create: jest.fn().mockResolvedValue({
                        id: 'k1',
                        name: 'my-key',
                        keyPrefix: 'inf_key_',
                        scopes: ['risks.read'],
                        expiresAt: null,
                        createdAt: new Date(),
                    }),
                },
            };
            return fn(fakeDb as never);
        });

        const result = await createApiKey(makeRequestContext('ADMIN'), validInput);

        expect(result.plaintext).toBe('inf_key_secret_value_xyz');
        // Regression: a refactor that drops the plaintext from the
        // result leaves the key irretrievable — admins create-and-throw-
        // away an unusable credential.
    });

    it('persists the keyHash, NEVER the plaintext', async () => {
        let createCall: any;
        mockRunInTx.mockImplementationOnce(async (_ctx, fn) => {
            const fakeDb = {
                tenantApiKey: {
                    create: jest.fn().mockImplementation((args: any) => {
                        createCall = args;
                        return { id: 'k1', name: 'x', keyPrefix: 'inf_', scopes: [], expiresAt: null, createdAt: new Date() };
                    }),
                },
            };
            return fn(fakeDb as never);
        });

        await createApiKey(makeRequestContext('ADMIN'), validInput);

        expect(createCall.data.keyHash).toBe('hashed-blob');
        // Regression: a buggy refactor that persists `plaintext` instead
        // of `keyHash` would store the credential in clear text.
        expect(JSON.stringify(createCall.data)).not.toContain('inf_key_secret_value_xyz');
    });

    it('rejects EDITOR — assertCanManageMembers gate', async () => {
        await expect(
            createApiKey(makeRequestContext('EDITOR'), validInput),
        ).rejects.toThrow();
        expect(mockRunInTx).not.toHaveBeenCalled();
    });

    it('rejects when scopes contain unknown values', async () => {
        mockValidate.mockReturnValue(['unknown.scope is not a valid permission']);
        await expect(
            createApiKey(makeRequestContext('ADMIN'), {
                name: 'k',
                scopes: ['unknown.scope'],
            }),
        ).rejects.toThrow(/Invalid scopes/);
    });

    it('rejects when name is empty / whitespace-only', async () => {
        await expect(
            createApiKey(makeRequestContext('ADMIN'), { name: '   ', scopes: ['risks.read'] }),
        ).rejects.toThrow(/Key name is required/);
    });

    it('rejects when name exceeds 100 chars', async () => {
        await expect(
            createApiKey(makeRequestContext('ADMIN'), { name: 'a'.repeat(101), scopes: ['risks.read'] }),
        ).rejects.toThrow(/100 characters or fewer/);
    });

    it('rejects expiry in the past', async () => {
        await expect(
            createApiKey(makeRequestContext('ADMIN'), {
                ...validInput,
                expiresAt: new Date(Date.now() - 1000).toISOString(),
            }),
        ).rejects.toThrow(/must be in the future/);
    });

    it('rejects malformed expiry string', async () => {
        await expect(
            createApiKey(makeRequestContext('ADMIN'), {
                ...validInput,
                expiresAt: 'not-a-date',
            }),
        ).rejects.toThrow(/Invalid expiry/);
    });

    it('emits API_KEY_CREATED audit with scopes but NO plaintext / hash', async () => {
        mockRunInTx.mockImplementationOnce(async (_ctx, fn) => {
            const fakeDb = {
                tenantApiKey: {
                    create: jest.fn().mockResolvedValue({
                        id: 'k1',
                        name: 'my-key',
                        keyPrefix: 'inf_key_',
                        scopes: ['risks.read'],
                        expiresAt: null,
                        createdAt: new Date(),
                    }),
                },
            };
            return fn(fakeDb as never);
        });

        await createApiKey(makeRequestContext('ADMIN'), validInput);

        expect(mockLog).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.objectContaining({ action: 'API_KEY_CREATED' }),
        );
        const auditPayload = JSON.stringify(mockLog.mock.calls[0][2]);
        // Regression: a buggy audit emit that includes the plaintext
        // would persist the credential in the hash-chained audit log
        // forever.
        expect(auditPayload).not.toContain('inf_key_secret_value_xyz');
        expect(auditPayload).not.toContain('hashed-blob');
        expect(auditPayload).toContain('risks.read'); // scopes ARE audited
    });
});

describe('revokeApiKey', () => {
    it('rejects when key not found in caller tenant (cross-tenant id leak)', async () => {
        mockRunInTx.mockImplementationOnce(async (_ctx, fn) => {
            const fakeDb = {
                tenantApiKey: {
                    findFirst: jest.fn().mockResolvedValue(null),
                    update: jest.fn(),
                },
            };
            return fn(fakeDb as never);
        });

        await expect(
            revokeApiKey(makeRequestContext('ADMIN', { tenantId: 'tenant-A' }), 'tenant-B-key-id'),
        ).rejects.toThrow();
        // Regression: a buggy lookup that omits tenantId from the WHERE
        // would let admin in A revoke admin in B's keys.
    });

    it('rejects EDITOR caller', async () => {
        await expect(
            revokeApiKey(makeRequestContext('EDITOR'), 'k1'),
        ).rejects.toThrow();
    });
});

describe('listApiKeys', () => {
    it('rejects READER on list (admin settings gate)', async () => {
        await expect(
            listApiKeys(makeRequestContext('READER')),
        ).rejects.toThrow();
    });
});
