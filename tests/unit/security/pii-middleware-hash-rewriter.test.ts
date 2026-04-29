/**
 * GAP-21 — pii-middleware WHERE-clause hash rewriter.
 *
 * After dropping the plaintext `email`/`name` columns from User,
 * AuditorAccount, and UserIdentityLink, the schema-level field name
 * (`email`) is `@map`'d to the encrypted DB column. A naive
 * `where: { email: 'foo@bar.com' }` would compare the plaintext
 * lookup value against the random-IV ciphertext column and never
 * match. The middleware redirects every WHERE on a managed plain
 * field to its `*Hash` counterpart so equality lookups continue to
 * function (and uniqueness/dedup logic relies on the deterministic
 * hash, not the ciphertext).
 *
 * These tests exercise the pure transform via the test-only
 * `_rewriteWhereForHash` export, then assert the full middleware
 * propagates the rewrite end-to-end via a stub Prisma driver.
 */
import { piiEncryptionMiddleware, _rewriteWhereForHash } from '@/lib/security/pii-middleware';
import { hashForLookup } from '@/lib/security/encryption';

describe('pii-middleware — WHERE rewriter (pure)', () => {
    test('User.email bare equality → emailHash', () => {
        const where: Record<string, unknown> = { email: 'a@b.com' };
        _rewriteWhereForHash(where, 'User');
        expect(where).toEqual({ emailHash: hashForLookup('a@b.com') });
        expect(where.email).toBeUndefined();
    });

    test('User.email { equals: ... } → emailHash', () => {
        const where: Record<string, unknown> = { email: { equals: 'a@b.com' } };
        _rewriteWhereForHash(where, 'User');
        expect(where).toEqual({ emailHash: hashForLookup('a@b.com') });
    });

    test('User.email { in: [...] } → emailHash { in: [hashed...] }', () => {
        const where: Record<string, unknown> = {
            email: { in: ['a@b.com', 'c@d.com'] },
        };
        _rewriteWhereForHash(where, 'User');
        expect(where).toEqual({
            emailHash: { in: [hashForLookup('a@b.com'), hashForLookup('c@d.com')] },
        });
    });

    test('AuditorAccount.email bare equality → emailHash', () => {
        const where: Record<string, unknown> = {
            tenantId: 't-1',
            email: 'auditor@example.com',
        };
        _rewriteWhereForHash(where, 'AuditorAccount');
        expect(where).toEqual({
            tenantId: 't-1',
            emailHash: hashForLookup('auditor@example.com'),
        });
    });

    test('UserIdentityLink.emailAtLinkTime → emailAtLinkTimeHash', () => {
        const where: Record<string, unknown> = {
            emailAtLinkTime: 'sso@example.com',
        };
        _rewriteWhereForHash(where, 'UserIdentityLink');
        expect(where).toEqual({
            emailAtLinkTimeHash: hashForLookup('sso@example.com'),
        });
    });

    test('non-managed field is left alone', () => {
        const where: Record<string, unknown> = {
            id: 'usr-1',
            createdAt: { gt: new Date(0) },
        };
        const before = JSON.stringify(where);
        _rewriteWhereForHash(where, 'User');
        expect(JSON.stringify(where)).toBe(before);
    });

    test('field with no hash column (legacy User.name) is NOT rewritten', () => {
        // `name` on User is mapped to nameEncrypted but there is no
        // `nameHash` column — a `where: { name: 'X' }` cannot be
        // redirected to a hash, so the rewriter MUST leave it
        // untouched. (The lookup will still fail at runtime against
        // the ciphertext column; that's a caller bug to surface, not
        // for the middleware to silently pretend-fix.)
        const where: Record<string, unknown> = { name: 'Alice' };
        const before = JSON.stringify(where);
        _rewriteWhereForHash(where, 'User');
        expect(JSON.stringify(where)).toBe(before);
    });

    test('AND/OR/NOT compound clauses are recursed into', () => {
        const where: Record<string, unknown> = {
            OR: [
                { email: 'a@b.com' },
                { email: { equals: 'c@d.com' } },
            ],
        };
        _rewriteWhereForHash(where, 'User');
        expect(where).toEqual({
            OR: [
                { emailHash: hashForLookup('a@b.com') },
                { emailHash: hashForLookup('c@d.com') },
            ],
        });
    });

    test('non-string predicate (operators like contains) is left intact', () => {
        // `contains` on a hash column is meaningless — the middleware
        // refuses to silently rewrite into something incorrect. The
        // caller's lookup will return 0 rows (a bug they can debug)
        // rather than a wrong-but-plausible result.
        const where: Record<string, unknown> = {
            email: { contains: 'partial' },
        };
        const before = JSON.stringify(where);
        _rewriteWhereForHash(where, 'User');
        expect(JSON.stringify(where)).toBe(before);
    });

    test('hash is normalised — case-insensitive lookup matches', () => {
        const w1: Record<string, unknown> = { email: 'ALICE@example.com' };
        const w2: Record<string, unknown> = { email: 'alice@example.com' };
        _rewriteWhereForHash(w1, 'User');
        _rewriteWhereForHash(w2, 'User');
        expect(w1.emailHash).toBe(w2.emailHash);
    });
});

describe('pii-middleware — full middleware propagation', () => {
    test('findUnique on User.email rewrites to emailHash before next()', async () => {
        let observed: unknown;
        const next = jest.fn(async (params: unknown) => {
            observed = params;
            return null;
        });
        await piiEncryptionMiddleware(
            {
                model: 'User',
                action: 'findUnique',
                args: { where: { email: 'a@b.com' } },
                dataPath: [],
                runInTransaction: false,
            },
            next as unknown as (p: unknown) => Promise<unknown>,
        );
        expect(observed).toMatchObject({
            args: {
                where: { emailHash: hashForLookup('a@b.com') },
            },
        });
        // The plaintext `email` key MUST be gone by the time Prisma sees
        // the query — leaving it would trigger a "field email not found
        // in WhereInput" runtime error after the column drop.
        const passedWhere = (observed as { args: { where: Record<string, unknown> } })
            .args.where;
        expect(passedWhere.email).toBeUndefined();
    });

    test('create on User.email auto-populates emailHash', async () => {
        let observed: unknown;
        const next = jest.fn(async (params: unknown) => {
            observed = params;
            return { id: 'u1', email: 'a@b.com', emailHash: hashForLookup('a@b.com') };
        });
        await piiEncryptionMiddleware(
            {
                model: 'User',
                action: 'create',
                args: { data: { email: 'a@b.com', name: 'Alice' } },
                dataPath: [],
                runInTransaction: false,
            },
            next as unknown as (p: unknown) => Promise<unknown>,
        );
        const data = (observed as { args: { data: Record<string, unknown> } }).args.data;
        // Hash is set deterministically.
        expect(data.emailHash).toBe(hashForLookup('a@b.com'));
        // The `email` key now holds ciphertext (mapped to encrypted column).
        // We don't check the exact ciphertext (random IV), just that it's
        // not the plaintext.
        expect(data.email).not.toBe('a@b.com');
        expect(typeof data.email).toBe('string');
    });

    test('upsert rewrites both where AND create email', async () => {
        let observed: unknown;
        const next = jest.fn(async (params: unknown) => {
            observed = params;
            return null;
        });
        await piiEncryptionMiddleware(
            {
                model: 'User',
                action: 'upsert',
                args: {
                    where: { email: 'a@b.com' },
                    create: { email: 'a@b.com', name: 'Alice' },
                    update: {},
                },
                dataPath: [],
                runInTransaction: false,
            },
            next as unknown as (p: unknown) => Promise<unknown>,
        );
        const args = (observed as { args: Record<string, unknown> }).args;
        const where = args.where as Record<string, unknown>;
        const create = args.create as Record<string, unknown>;
        expect(where.emailHash).toBe(hashForLookup('a@b.com'));
        expect(where.email).toBeUndefined();
        expect(create.emailHash).toBe(hashForLookup('a@b.com'));
        expect(create.email).not.toBe('a@b.com'); // ciphertext now
    });

    test('updateMany rewrites where', async () => {
        let observed: unknown;
        const next = jest.fn(async (params: unknown) => {
            observed = params;
            return { count: 0 };
        });
        await piiEncryptionMiddleware(
            {
                model: 'User',
                action: 'updateMany',
                args: { where: { email: 'a@b.com' }, data: {} },
                dataPath: [],
                runInTransaction: false,
            },
            next as unknown as (p: unknown) => Promise<unknown>,
        );
        const where = (observed as { args: { where: Record<string, unknown> } }).args.where;
        expect(where.emailHash).toBe(hashForLookup('a@b.com'));
    });

    test('non-managed model passes through untouched', async () => {
        let observed: unknown;
        const next = jest.fn(async (params: unknown) => {
            observed = params;
            return null;
        });
        await piiEncryptionMiddleware(
            {
                model: 'Tenant',
                action: 'findUnique',
                args: { where: { slug: 'acme' } },
                dataPath: [],
                runInTransaction: false,
            },
            next as unknown as (p: unknown) => Promise<unknown>,
        );
        expect(observed).toMatchObject({
            args: { where: { slug: 'acme' } },
        });
    });
});

describe('pii-middleware — duplicate-registration prevention', () => {
    test('two registrations with same email produce same hash → DB unique catches dupe', () => {
        const a = hashForLookup('alice@example.com');
        const b = hashForLookup('alice@example.com');
        expect(a).toBe(b);
    });

    test('case + whitespace normalisation collapses to one hash', () => {
        const a = hashForLookup('  ALICE@example.com  ');
        const b = hashForLookup('alice@example.com');
        expect(a).toBe(b);
    });
});
