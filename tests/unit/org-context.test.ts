/**
 * Epic O-2 — `getOrgCtx` resolver unit contract.
 *
 * Mocks the session helper (`getSessionOrThrow`) and the Prisma
 * client at the module boundary so the test exercises the resolver's
 * branching directly without needing a live DB. The integration-side
 * coverage (where the full schema + RLS + memberships must align)
 * lives in `tests/integration/org-bootstrap.test.ts`.
 *
 * Failure-shape contract asserted here:
 *   - badRequest    (400) when slug is empty / whitespace
 *   - notFound      (404) when slug doesn't resolve to an Organization
 *   - forbidden     (403) when slug resolves but the user is not a member
 *   - unauthorized  (401) when no session — covered by mocking
 *                   getSessionOrThrow to throw, since the resolver
 *                   delegates to it as the very first step.
 */

const sessionMock = jest.fn();
const orgFindUniqueMock = jest.fn();
const orgMembershipFindUniqueMock = jest.fn();

jest.mock('@/lib/auth', () => ({
    __esModule: true,
    getSessionOrThrow: () => sessionMock(),
}));

jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: {
        organization: { findUnique: (...args: unknown[]) => orgFindUniqueMock(...args) },
        orgMembership: { findUnique: (...args: unknown[]) => orgMembershipFindUniqueMock(...args) },
    },
    prisma: {
        organization: { findUnique: (...args: unknown[]) => orgFindUniqueMock(...args) },
        orgMembership: { findUnique: (...args: unknown[]) => orgMembershipFindUniqueMock(...args) },
    },
}));

// Observability writer is a no-op in tests; no need to assert on it.
jest.mock('@/lib/observability/context', () => ({
    __esModule: true,
    mergeRequestContext: () => undefined,
}));

import { getOrgCtx } from '@/app-layer/context';

beforeEach(() => {
    sessionMock.mockReset();
    orgFindUniqueMock.mockReset();
    orgMembershipFindUniqueMock.mockReset();
});

function happySession() {
    sessionMock.mockResolvedValue({
        userId: 'user-1',
        tenantId: 'tenant-irrelevant',
        email: 'ciso@example.com',
        role: 'AUDITOR',
    });
}

describe('Epic O-2 — getOrgCtx', () => {
    it('returns a typed OrgContext on the happy path', async () => {
        happySession();
        orgFindUniqueMock.mockResolvedValue({ id: 'org-1', slug: 'acme-org' });
        orgMembershipFindUniqueMock.mockResolvedValue({ role: 'ORG_ADMIN' });

        const ctx = await getOrgCtx({ orgSlug: 'acme-org' });

        expect(ctx.userId).toBe('user-1');
        expect(ctx.organizationId).toBe('org-1');
        expect(ctx.orgSlug).toBe('acme-org');
        expect(ctx.orgRole).toBe('ORG_ADMIN');
        // permissions field is pre-derived by the resolver
        expect(ctx.permissions.canViewPortfolio).toBe(true);
        expect(ctx.permissions.canManageTenants).toBe(true);
        expect(ctx.permissions.canDrillDown).toBe(true);
        expect(typeof ctx.requestId).toBe('string');
        expect(ctx.requestId.length).toBeGreaterThan(0);
    });

    it('ORG_READER context carries the reader permission map', async () => {
        happySession();
        orgFindUniqueMock.mockResolvedValue({ id: 'org-1', slug: 'acme-org' });
        orgMembershipFindUniqueMock.mockResolvedValue({ role: 'ORG_READER' });

        const ctx = await getOrgCtx({ orgSlug: 'acme-org' });

        expect(ctx.orgRole).toBe('ORG_READER');
        expect(ctx.permissions.canViewPortfolio).toBe(true);
        expect(ctx.permissions.canExportReports).toBe(true);
        expect(ctx.permissions.canDrillDown).toBe(false);
        expect(ctx.permissions.canManageTenants).toBe(false);
        expect(ctx.permissions.canManageMembers).toBe(false);
    });

    // ── Error branches ──────────────────────────────────────────────

    it('throws unauthorized when no session is present (delegates to getSessionOrThrow)', async () => {
        // The auth helper itself throws the unauthorized error; we just
        // assert that getOrgCtx propagates and never reaches the DB.
        sessionMock.mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401 }));

        await expect(getOrgCtx({ orgSlug: 'acme-org' })).rejects.toMatchObject({
            message: 'Unauthorized',
        });
        expect(orgFindUniqueMock).not.toHaveBeenCalled();
        expect(orgMembershipFindUniqueMock).not.toHaveBeenCalled();
    });

    it('throws badRequest when slug is empty', async () => {
        happySession();

        await expect(getOrgCtx({ orgSlug: '' })).rejects.toMatchObject({
            status: 400,
        });
        expect(orgFindUniqueMock).not.toHaveBeenCalled();
    });

    it('throws badRequest when slug is whitespace-only', async () => {
        happySession();

        await expect(getOrgCtx({ orgSlug: '   ' })).rejects.toMatchObject({
            status: 400,
        });
        expect(orgFindUniqueMock).not.toHaveBeenCalled();
    });

    it('throws notFound when the org slug does not resolve', async () => {
        happySession();
        orgFindUniqueMock.mockResolvedValue(null);

        await expect(getOrgCtx({ orgSlug: 'no-such-org' })).rejects.toMatchObject({
            status: 404,
        });
        // The membership lookup must NOT run if the org doesn't exist.
        expect(orgMembershipFindUniqueMock).not.toHaveBeenCalled();
    });

    it('throws forbidden when the user has no OrgMembership in this org', async () => {
        happySession();
        orgFindUniqueMock.mockResolvedValue({ id: 'org-1', slug: 'acme-org' });
        orgMembershipFindUniqueMock.mockResolvedValue(null);

        await expect(getOrgCtx({ orgSlug: 'acme-org' })).rejects.toMatchObject({
            status: 403,
        });
    });

    it('forbidden message does not echo the slug (no enumeration via error text)', async () => {
        happySession();
        orgFindUniqueMock.mockResolvedValue({ id: 'org-1', slug: 'acme-org' });
        orgMembershipFindUniqueMock.mockResolvedValue(null);

        try {
            await getOrgCtx({ orgSlug: 'acme-org' });
            throw new Error('expected forbidden to throw');
        } catch (err) {
            expect((err as Error).message).not.toContain('acme-org');
        }
    });

    it('looks up the membership using the (organizationId, userId) compound key', async () => {
        happySession();
        orgFindUniqueMock.mockResolvedValue({ id: 'org-1', slug: 'acme-org' });
        orgMembershipFindUniqueMock.mockResolvedValue({ role: 'ORG_ADMIN' });

        await getOrgCtx({ orgSlug: 'acme-org' });

        expect(orgMembershipFindUniqueMock).toHaveBeenCalledTimes(1);
        const arg = orgMembershipFindUniqueMock.mock.calls[0][0];
        expect(arg.where).toEqual({
            organizationId_userId: {
                organizationId: 'org-1',
                userId: 'user-1',
            },
        });
    });
});
