/**
 * Unit tests for `authenticateWithPassword` — the single chokepoint
 * every email+password login flows through.
 *
 * Covers the contract the provider + legacy route rely on:
 *   - Success returns { ok: true } + the right user fields
 *   - Unknown email, missing password hash, wrong password all collapse
 *     into the same { ok: false, reason: 'credentials_invalid' } shape
 *     (account-enumeration safety)
 *   - DB errors during lookup also collapse to credentials_invalid
 *     (doesn't leak DB-is-down to the client)
 *   - When AUTH_REQUIRE_EMAIL_VERIFICATION=1, unverified accounts get
 *     the distinct `email_not_verified` reason (for future verification-
 *     flow UX)
 *   - Silent rehash-on-verify fires when the stored hash is weaker than
 *     the current BCRYPT_COST
 *
 * prisma is mocked; bcryptjs runs for real so we're also end-to-end
 * exercising the hash module.
 */

import bcrypt from 'bcryptjs';

// Hoisted mocks: jest.mock() MUST run before `authenticateWithPassword` is
// imported or the real prisma client wins. We hand-roll a minimal mock that
// exposes just the two methods the chokepoint reaches for.
const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();
jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: {
        user: {
            findUnique: (...args: unknown[]) => mockFindUnique(...args),
            update: (...args: unknown[]) => mockUpdate(...args),
        },
    },
}));

// Env mock: the chokepoint reads `env.AUTH_REQUIRE_EMAIL_VERIFICATION`.
// We drive this per-test via a mutable object so we can flip the flag.
const mockEnv = { AUTH_REQUIRE_EMAIL_VERIFICATION: undefined as string | undefined };
jest.mock('@/env', () => ({
    __esModule: true,
    env: new Proxy(mockEnv, {
        get: (target, prop: string) => target[prop as keyof typeof target],
    }),
}));

import { authenticateWithPassword } from '@/lib/auth/credentials';
import { BCRYPT_COST } from '@/lib/auth/passwords';

beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
    mockEnv.AUTH_REQUIRE_EMAIL_VERIFICATION = undefined;
});

// ── Fixtures ────────────────────────────────────────────────────────────

async function makeUser(
    opts: {
        id?: string;
        email?: string;
        name?: string | null;
        password?: string | null;
        emailVerified?: Date | null;
        hashCost?: number;
    } = {},
) {
    const password = opts.password ?? 'Tr0ub4dor&3!';
    const passwordHash = opts.password === null
        ? null
        : await bcrypt.hash(password, opts.hashCost ?? BCRYPT_COST);
    return {
        id: opts.id ?? 'usr_1',
        email: opts.email ?? 'alice@example.com',
        name: opts.name ?? 'Alice',
        passwordHash,
        emailVerified: opts.emailVerified ?? null,
        _plaintext: password,
    };
}

// ── Success path ────────────────────────────────────────────────────────

describe('authenticateWithPassword — success', () => {
    it('returns { ok: true } with userId/email/name on correct credentials', async () => {
        const u = await makeUser();
        mockFindUnique.mockResolvedValue(u);

        const result = await authenticateWithPassword({
            email: u.email,
            password: u._plaintext,
        });

        expect(result).toEqual({
            ok: true,
            userId: u.id,
            email: u.email,
            name: u.name,
        });
    });

    it('lowercases and trims the input email before lookup', async () => {
        const u = await makeUser({ email: 'alice@example.com' });
        mockFindUnique.mockResolvedValue(u);

        await authenticateWithPassword({
            email: '  ALICE@Example.com  ',
            password: u._plaintext,
        });

        expect(mockFindUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { email: 'alice@example.com' } }),
        );
    });
});

// ── Failure path: account-enumeration-safe collapse ─────────────────────

describe('authenticateWithPassword — failure modes collapse to credentials_invalid', () => {
    it('returns credentials_invalid when the email is not in the DB', async () => {
        mockFindUnique.mockResolvedValue(null);
        const result = await authenticateWithPassword({
            email: 'unknown@example.com',
            password: 'whatever',
        });
        expect(result).toEqual({ ok: false, reason: 'credentials_invalid' });
    });

    it('returns credentials_invalid when the user exists but has no passwordHash (OAuth-only user)', async () => {
        const u = await makeUser({ password: null });
        mockFindUnique.mockResolvedValue(u);
        const result = await authenticateWithPassword({
            email: u.email,
            password: 'whatever',
        });
        expect(result).toEqual({ ok: false, reason: 'credentials_invalid' });
    });

    it('returns credentials_invalid when the password is wrong', async () => {
        const u = await makeUser();
        mockFindUnique.mockResolvedValue(u);
        const result = await authenticateWithPassword({
            email: u.email,
            password: 'definitely-not-the-right-one',
        });
        expect(result).toEqual({ ok: false, reason: 'credentials_invalid' });
    });

    it('returns credentials_invalid when email is empty', async () => {
        const result = await authenticateWithPassword({ email: '', password: 'anything' });
        expect(result).toEqual({ ok: false, reason: 'credentials_invalid' });
        // No DB hit for empty input
        expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it('returns credentials_invalid when password is empty', async () => {
        const result = await authenticateWithPassword({ email: 'a@b.co', password: '' });
        expect(result).toEqual({ ok: false, reason: 'credentials_invalid' });
        expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it('returns credentials_invalid (does not throw) when prisma lookup errors', async () => {
        mockFindUnique.mockRejectedValue(new Error('db down'));
        const result = await authenticateWithPassword({
            email: 'a@b.co',
            password: 'x',
        });
        expect(result).toEqual({ ok: false, reason: 'credentials_invalid' });
    });
});

// ── Email-verification gate (off-by-default, flip on via env) ───────────

describe('authenticateWithPassword — email verification gate', () => {
    it('succeeds when AUTH_REQUIRE_EMAIL_VERIFICATION is unset even if emailVerified is null', async () => {
        const u = await makeUser({ emailVerified: null });
        mockFindUnique.mockResolvedValue(u);
        const result = await authenticateWithPassword({
            email: u.email,
            password: u._plaintext,
        });
        expect(result.ok).toBe(true);
    });

    it('returns email_not_verified when gate is on and emailVerified is null', async () => {
        mockEnv.AUTH_REQUIRE_EMAIL_VERIFICATION = '1';
        const u = await makeUser({ emailVerified: null });
        mockFindUnique.mockResolvedValue(u);
        const result = await authenticateWithPassword({
            email: u.email,
            password: u._plaintext,
        });
        expect(result).toEqual({ ok: false, reason: 'email_not_verified' });
    });

    it('succeeds when gate is on and emailVerified is a Date', async () => {
        mockEnv.AUTH_REQUIRE_EMAIL_VERIFICATION = '1';
        const u = await makeUser({ emailVerified: new Date('2026-01-01') });
        mockFindUnique.mockResolvedValue(u);
        const result = await authenticateWithPassword({
            email: u.email,
            password: u._plaintext,
        });
        expect(result.ok).toBe(true);
    });
});

// ── Silent rehash-on-verify ─────────────────────────────────────────────

describe('authenticateWithPassword — rehash on verify', () => {
    it('rehashes and persists a stale-cost hash after successful verification', async () => {
        const u = await makeUser({ hashCost: Math.max(BCRYPT_COST - 2, 4) });
        mockFindUnique.mockResolvedValue(u);
        mockUpdate.mockResolvedValue(u);

        const result = await authenticateWithPassword({
            email: u.email,
            password: u._plaintext,
        });
        expect(result.ok).toBe(true);
        expect(mockUpdate).toHaveBeenCalledTimes(1);
        const args = mockUpdate.mock.calls[0][0] as {
            where: { id: string };
            data: { passwordHash: string };
        };
        expect(args.where.id).toBe(u.id);
        expect(args.data.passwordHash).toMatch(new RegExp(`^\\$2[aby]\\$${BCRYPT_COST}\\$`));
    });

    it('does NOT rehash when the stored hash is already at BCRYPT_COST', async () => {
        const u = await makeUser({ hashCost: BCRYPT_COST });
        mockFindUnique.mockResolvedValue(u);

        await authenticateWithPassword({ email: u.email, password: u._plaintext });
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('does NOT fail the login if the rehash write itself errors', async () => {
        const u = await makeUser({ hashCost: Math.max(BCRYPT_COST - 2, 4) });
        mockFindUnique.mockResolvedValue(u);
        mockUpdate.mockRejectedValue(new Error('transient db error'));

        const result = await authenticateWithPassword({
            email: u.email,
            password: u._plaintext,
        });
        // Caller already proved knowledge of the password — housekeeping
        // failure must not invalidate that.
        expect(result.ok).toBe(true);
    });
});
