/**
 * Epic O-2 — `org-members.ts` usecase unit contract.
 *
 * Mocks Prisma + the provisioning service at the module boundary so
 * the test exercises the side-effect wiring (provision on ORG_ADMIN
 * add, deprovision on ORG_ADMIN remove, last-admin guard).
 */

const userUpsertMock = jest.fn();
const orgMembershipFindUniqueMock = jest.fn();
const orgMembershipCreateMock = jest.fn();
const orgMembershipDeleteMock = jest.fn();
const orgMembershipUpdateMock = jest.fn();
const orgMembershipCountMock = jest.fn();
const transactionMock = jest.fn();
const provisionOrgAdminMock = jest.fn();
const deprovisionOrgAdminMock = jest.fn();

jest.mock('@/lib/prisma', () => {
    const client = {
        user: { upsert: (...a: unknown[]) => userUpsertMock(...a) },
        orgMembership: {
            findUnique: (...a: unknown[]) => orgMembershipFindUniqueMock(...a),
            create: (...a: unknown[]) => orgMembershipCreateMock(...a),
            delete: (...a: unknown[]) => orgMembershipDeleteMock(...a),
            update: (...a: unknown[]) => orgMembershipUpdateMock(...a),
            count: (...a: unknown[]) => orgMembershipCountMock(...a),
        },
        $transaction: (...a: unknown[]) => transactionMock(...a),
    };
    return { __esModule: true, default: client, prisma: client };
});

jest.mock('@/app-layer/usecases/org-provisioning', () => ({
    __esModule: true,
    provisionOrgAdminToTenants: (...a: unknown[]) => provisionOrgAdminMock(...a),
    deprovisionOrgAdmin: (...a: unknown[]) => deprovisionOrgAdminMock(...a),
}));

import {
    addOrgMember,
    changeOrgMemberRole,
    removeOrgMember,
} from '@/app-layer/usecases/org-members';
import type { OrgContext } from '@/app-layer/types';

function ctxFor(overrides: Partial<OrgContext> = {}): OrgContext {
    return {
        requestId: 'req-test',
        userId: 'caller-1',
        organizationId: 'org-1',
        orgSlug: 'acme-org',
        orgRole: 'ORG_ADMIN',
        permissions: {
            canViewPortfolio: true,
            canDrillDown: true,
            canExportReports: true,
            canManageTenants: true,
            canManageMembers: true,
        },
        ...overrides,
    };
}

beforeEach(() => {
    userUpsertMock.mockReset();
    orgMembershipFindUniqueMock.mockReset();
    orgMembershipCreateMock.mockReset();
    orgMembershipDeleteMock.mockReset();
    orgMembershipUpdateMock.mockReset();
    orgMembershipCountMock.mockReset();
    transactionMock.mockReset();
    provisionOrgAdminMock.mockReset();
    deprovisionOrgAdminMock.mockReset();
});

// ── addOrgMember ───────────────────────────────────────────────────────

describe('addOrgMember', () => {
    it('upserts the user, creates OrgMembership, fans out provisioning for ORG_ADMIN', async () => {
        userUpsertMock.mockResolvedValue({ id: 'user-2', email: 'ciso@example.com' });
        orgMembershipFindUniqueMock.mockResolvedValue(null);
        orgMembershipCreateMock.mockResolvedValue({
            id: 'mem-1',
            organizationId: 'org-1',
            userId: 'user-2',
            role: 'ORG_ADMIN',
        });
        provisionOrgAdminMock.mockResolvedValue({ created: 3, skipped: 0, totalConsidered: 3 });

        const result = await addOrgMember(ctxFor(), {
            userEmail: 'CISO@example.com',
            role: 'ORG_ADMIN',
        });

        // Email normalised to lowercase + trimmed at upsert.
        expect(userUpsertMock).toHaveBeenCalledTimes(1);
        const upsertArg = userUpsertMock.mock.calls[0][0];
        expect(upsertArg.where.email).toBe('ciso@example.com');

        // Provisioning fired with the correct (orgId, userId).
        expect(provisionOrgAdminMock).toHaveBeenCalledTimes(1);
        expect(provisionOrgAdminMock).toHaveBeenCalledWith('org-1', 'user-2');

        expect(result.membership.role).toBe('ORG_ADMIN');
        expect(result.provision).toEqual({ created: 3, skipped: 0, totalConsidered: 3 });
    });

    it('does NOT fan out provisioning for ORG_READER', async () => {
        userUpsertMock.mockResolvedValue({ id: 'user-3', email: 'reader@example.com' });
        orgMembershipFindUniqueMock.mockResolvedValue(null);
        orgMembershipCreateMock.mockResolvedValue({
            id: 'mem-2',
            organizationId: 'org-1',
            userId: 'user-3',
            role: 'ORG_READER',
        });

        const result = await addOrgMember(ctxFor(), {
            userEmail: 'reader@example.com',
            role: 'ORG_READER',
        });

        expect(provisionOrgAdminMock).not.toHaveBeenCalled();
        expect(result.provision).toBeUndefined();
        expect(result.membership.role).toBe('ORG_READER');
    });

    it('throws ConflictError when the user is already a member', async () => {
        userUpsertMock.mockResolvedValue({ id: 'user-2', email: 'ciso@example.com' });
        orgMembershipFindUniqueMock.mockResolvedValue({ role: 'ORG_READER' });

        await expect(
            addOrgMember(ctxFor(), { userEmail: 'ciso@example.com', role: 'ORG_ADMIN' }),
        ).rejects.toMatchObject({ status: 409 });

        // Membership creation must NOT happen on conflict.
        expect(orgMembershipCreateMock).not.toHaveBeenCalled();
        expect(provisionOrgAdminMock).not.toHaveBeenCalled();
    });
});

// ── removeOrgMember ────────────────────────────────────────────────────

describe('removeOrgMember', () => {
    it('deprovisions and deletes when removing an ORG_ADMIN (count > 1)', async () => {
        orgMembershipFindUniqueMock.mockResolvedValue({ id: 'mem-1', role: 'ORG_ADMIN' });
        orgMembershipCountMock.mockResolvedValue(2); // not the last admin
        deprovisionOrgAdminMock.mockResolvedValue({
            deleted: 3,
            tenantIds: ['t-1', 't-2', 't-3'],
        });
        orgMembershipDeleteMock.mockResolvedValue({ id: 'mem-1' });

        const result = await removeOrgMember(ctxFor(), { userId: 'user-2' });

        // Deprovision fired BEFORE the OrgMembership delete.
        const deprovisionOrder =
            (deprovisionOrgAdminMock.mock.invocationCallOrder[0] ?? 0) <
            (orgMembershipDeleteMock.mock.invocationCallOrder[0] ?? 0);
        expect(deprovisionOrder).toBe(true);

        expect(deprovisionOrgAdminMock).toHaveBeenCalledWith('org-1', 'user-2');
        expect(result.wasOrgAdmin).toBe(true);
        expect(result.deprovision).toEqual({ deleted: 3, tenantIds: ['t-1', 't-2', 't-3'] });
        expect(result.deletedMembershipId).toBe('mem-1');
    });

    it('does NOT deprovision when removing an ORG_READER', async () => {
        orgMembershipFindUniqueMock.mockResolvedValue({ id: 'mem-2', role: 'ORG_READER' });
        orgMembershipDeleteMock.mockResolvedValue({ id: 'mem-2' });

        const result = await removeOrgMember(ctxFor(), { userId: 'user-3' });

        expect(orgMembershipCountMock).not.toHaveBeenCalled();
        expect(deprovisionOrgAdminMock).not.toHaveBeenCalled();
        expect(result.wasOrgAdmin).toBe(false);
        expect(result.deprovision).toBeUndefined();
    });

    it('refuses to remove the last ORG_ADMIN (last-admin guard)', async () => {
        orgMembershipFindUniqueMock.mockResolvedValue({ id: 'mem-1', role: 'ORG_ADMIN' });
        orgMembershipCountMock.mockResolvedValue(1); // last admin

        await expect(
            removeOrgMember(ctxFor(), { userId: 'user-2' }),
        ).rejects.toMatchObject({ status: 409 });

        expect(deprovisionOrgAdminMock).not.toHaveBeenCalled();
        expect(orgMembershipDeleteMock).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the membership does not exist', async () => {
        orgMembershipFindUniqueMock.mockResolvedValue(null);

        await expect(
            removeOrgMember(ctxFor(), { userId: 'user-99' }),
        ).rejects.toMatchObject({ status: 404 });

        expect(deprovisionOrgAdminMock).not.toHaveBeenCalled();
        expect(orgMembershipDeleteMock).not.toHaveBeenCalled();
    });

    it('throws ValidationError when userId is empty', async () => {
        await expect(
            removeOrgMember(ctxFor(), { userId: '' }),
        ).rejects.toMatchObject({ status: 400 });

        expect(orgMembershipFindUniqueMock).not.toHaveBeenCalled();
    });
});

// ── changeOrgMemberRole ───────────────────────────────────────────────

describe('changeOrgMemberRole', () => {
    // Default $transaction mock — invokes the callback with the same
    // prisma client, so methods called on `tx` resolve through the
    // outer mocks. Each test that needs a different shape overrides
    // this in its setup.
    function wireTransactionPassthrough() {
        transactionMock.mockImplementation(async (cb: unknown) => {
            const fn = cb as (tx: unknown) => Promise<unknown>;
            // The tx client is a structural subset of prisma — we
            // pass the orgMembership + tenant + tenantMembership
            // accessors the helpers might call. Provisioning helpers
            // are mocked at module boundary so they don't reach the
            // tx client; the role-change usecase only touches
            // tx.orgMembership.update + tx.orgMembership.count here.
            return fn({
                orgMembership: {
                    update: orgMembershipUpdateMock,
                    count: orgMembershipCountMock,
                },
            });
        });
    }

    it('READER → ADMIN: updates role inside tx and triggers provisioning fan-out', async () => {
        orgMembershipFindUniqueMock.mockResolvedValue({
            id: 'mem-1',
            role: 'ORG_READER',
        });
        orgMembershipUpdateMock.mockResolvedValue({
            id: 'mem-1',
            organizationId: 'org-1',
            userId: 'user-2',
            role: 'ORG_ADMIN',
        });
        provisionOrgAdminMock.mockResolvedValue({
            created: 4,
            skipped: 0,
            totalConsidered: 4,
        });
        wireTransactionPassthrough();

        const result = await changeOrgMemberRole(ctxFor(), {
            userId: 'user-2',
            role: 'ORG_ADMIN',
        });

        // Single transaction wrapping both sides.
        expect(transactionMock).toHaveBeenCalledTimes(1);

        // Role updated.
        expect(orgMembershipUpdateMock).toHaveBeenCalledWith({
            where: { id: 'mem-1' },
            data: { role: 'ORG_ADMIN' },
            select: expect.any(Object),
        });

        // Provisioning called with the tx client (3rd arg, NOT the
        // global prisma).
        expect(provisionOrgAdminMock).toHaveBeenCalledTimes(1);
        const provisionCall = provisionOrgAdminMock.mock.calls[0];
        expect(provisionCall[0]).toBe('org-1');
        expect(provisionCall[1]).toBe('user-2');
        expect(provisionCall[2]).toBeDefined(); // tx client passed

        // Demotion side effect MUST NOT fire.
        expect(deprovisionOrgAdminMock).not.toHaveBeenCalled();

        expect(result.transition).toBe('reader_to_admin');
        expect(result.provision).toEqual({
            created: 4,
            skipped: 0,
            totalConsidered: 4,
        });
        expect(result.deprovision).toBeUndefined();
        expect(result.membership.role).toBe('ORG_ADMIN');
    });

    it('ADMIN → READER: updates role inside tx and triggers deprovisioning (count > 1)', async () => {
        orgMembershipFindUniqueMock.mockResolvedValue({
            id: 'mem-1',
            role: 'ORG_ADMIN',
        });
        // Outer count check + inner re-check in tx — both > 1.
        orgMembershipCountMock.mockResolvedValue(3);
        orgMembershipUpdateMock.mockResolvedValue({
            id: 'mem-1',
            organizationId: 'org-1',
            userId: 'user-2',
            role: 'ORG_READER',
        });
        deprovisionOrgAdminMock.mockResolvedValue({
            deleted: 4,
            tenantIds: ['t-1', 't-2', 't-3', 't-4'],
        });
        wireTransactionPassthrough();

        const result = await changeOrgMemberRole(ctxFor(), {
            userId: 'user-2',
            role: 'ORG_READER',
        });

        expect(transactionMock).toHaveBeenCalledTimes(1);

        // Deprovision called with the tx client (3rd arg).
        expect(deprovisionOrgAdminMock).toHaveBeenCalledTimes(1);
        const deprovisionCall = deprovisionOrgAdminMock.mock.calls[0];
        expect(deprovisionCall[0]).toBe('org-1');
        expect(deprovisionCall[1]).toBe('user-2');
        expect(deprovisionCall[2]).toBeDefined();

        // Provision side effect MUST NOT fire.
        expect(provisionOrgAdminMock).not.toHaveBeenCalled();

        expect(result.transition).toBe('admin_to_reader');
        expect(result.deprovision).toEqual({
            deleted: 4,
            tenantIds: ['t-1', 't-2', 't-3', 't-4'],
        });
        expect(result.provision).toBeUndefined();
        expect(result.membership.role).toBe('ORG_READER');
    });

    it('ADMIN → READER: refuses to demote the last ORG_ADMIN (outer guard)', async () => {
        orgMembershipFindUniqueMock.mockResolvedValue({
            id: 'mem-1',
            role: 'ORG_ADMIN',
        });
        // Last admin — guard refuses BEFORE opening the transaction.
        orgMembershipCountMock.mockResolvedValue(1);

        await expect(
            changeOrgMemberRole(ctxFor(), {
                userId: 'user-2',
                role: 'ORG_READER',
            }),
        ).rejects.toMatchObject({ status: 409 });

        // Transaction never opened, no role mutation, no
        // deprovisioning fan-in.
        expect(transactionMock).not.toHaveBeenCalled();
        expect(orgMembershipUpdateMock).not.toHaveBeenCalled();
        expect(deprovisionOrgAdminMock).not.toHaveBeenCalled();
    });

    it('ADMIN → READER: also catches the race inside the tx (inner re-check)', async () => {
        orgMembershipFindUniqueMock.mockResolvedValue({
            id: 'mem-1',
            role: 'ORG_ADMIN',
        });
        // Outer count returns 2 (passes), inner returns 1 (race).
        orgMembershipCountMock
            .mockResolvedValueOnce(2)
            .mockResolvedValueOnce(1);
        wireTransactionPassthrough();

        await expect(
            changeOrgMemberRole(ctxFor(), {
                userId: 'user-2',
                role: 'ORG_READER',
            }),
        ).rejects.toMatchObject({ status: 409 });

        // Transaction opened, but the tx body threw before the role
        // update or the deprovision call.
        expect(transactionMock).toHaveBeenCalledTimes(1);
        expect(orgMembershipUpdateMock).not.toHaveBeenCalled();
        expect(deprovisionOrgAdminMock).not.toHaveBeenCalled();
    });

    it('no-op transition: same role, no transaction, no provisioning', async () => {
        orgMembershipFindUniqueMock.mockResolvedValue({
            id: 'mem-1',
            role: 'ORG_READER',
        });

        const result = await changeOrgMemberRole(ctxFor(), {
            userId: 'user-2',
            role: 'ORG_READER',
        });

        expect(result.transition).toBe('noop');
        expect(transactionMock).not.toHaveBeenCalled();
        expect(orgMembershipUpdateMock).not.toHaveBeenCalled();
        expect(provisionOrgAdminMock).not.toHaveBeenCalled();
        expect(deprovisionOrgAdminMock).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the membership does not exist', async () => {
        orgMembershipFindUniqueMock.mockResolvedValue(null);

        await expect(
            changeOrgMemberRole(ctxFor(), {
                userId: 'user-99',
                role: 'ORG_ADMIN',
            }),
        ).rejects.toMatchObject({ status: 404 });

        expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws ValidationError when userId is empty', async () => {
        await expect(
            changeOrgMemberRole(ctxFor(), {
                userId: '',
                role: 'ORG_ADMIN',
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(orgMembershipFindUniqueMock).not.toHaveBeenCalled();
    });
});
