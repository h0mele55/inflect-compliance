/**
 * Unit tests for src/app-layer/usecases/mfa.ts
 *
 * Wave 2 of GAP-02. Top-level MFA orchestration was zero-coverage.
 * The single load-bearing behaviour: the anti-lockout safeguard on
 * `updateTenantMfaPolicy` — flipping the policy to REQUIRED while
 * NO admin has MFA enrolled would lock every admin out forever.
 *
 * Behaviours protected:
 *   1. Only canAdmin can update the policy
 *   2. REQUIRED rejected when no admin has verified MFA
 *   3. REQUIRED accepted when at least one admin is enrolled
 *   4. OPTIONAL / DISABLED bypass the lockout check entirely
 *   5. Tenant with zero ADMINs (edge case) accepts REQUIRED — no
 *      lockout possible if no one to lock out
 */

jest.mock('@/lib/prisma', () => ({
    prisma: {
        tenantMembership: { findMany: jest.fn() },
        userMfaEnrollment: { count: jest.fn() },
        tenantSecuritySettings: { upsert: jest.fn() },
    },
}));

jest.mock('../../../src/app-layer/events/audit', () => ({
    logEvent: jest.fn().mockResolvedValue(undefined),
}));

import { updateTenantMfaPolicy } from '@/app-layer/usecases/mfa';
import { prisma } from '@/lib/prisma';
import { makeRequestContext } from '../../helpers/make-context';

const mockMembershipFind = prisma.tenantMembership.findMany as jest.MockedFunction<
    typeof prisma.tenantMembership.findMany
>;
const mockEnrollCount = prisma.userMfaEnrollment.count as jest.MockedFunction<
    typeof prisma.userMfaEnrollment.count
>;
const mockSettingsUpsert = prisma.tenantSecuritySettings.upsert as jest.MockedFunction<
    typeof prisma.tenantSecuritySettings.upsert
>;

const settingsRow = {
    id: 's1',
    tenantId: 't1',
    mfaPolicy: 'OPTIONAL' as const,
    sessionMaxAgeMinutes: null,
    auditWebhookUrl: null,
    auditWebhookSecretEncrypted: null,
    createdAt: new Date(),
    updatedAt: new Date(),
};

beforeEach(() => {
    jest.clearAllMocks();
    mockMembershipFind.mockResolvedValue([] as never);
    mockEnrollCount.mockResolvedValue(0);
    mockSettingsUpsert.mockResolvedValue(settingsRow as never);
});

describe('updateTenantMfaPolicy', () => {
    it('rejects EDITOR — only canAdmin can update policy', async () => {
        await expect(
            updateTenantMfaPolicy(makeRequestContext('EDITOR'), {
                mfaPolicy: 'OPTIONAL',
            } as never),
        ).rejects.toThrow(/Only admins/);
        expect(mockSettingsUpsert).not.toHaveBeenCalled();
    });

    // ── Anti-lockout: the load-bearing test ──
    it('rejects REQUIRED when no admin has verified MFA enrollment', async () => {
        mockMembershipFind.mockResolvedValue([
            { userId: 'admin-1' },
            { userId: 'admin-2' },
        ] as never);
        mockEnrollCount.mockResolvedValue(0); // ZERO enrolled admins

        await expect(
            updateTenantMfaPolicy(makeRequestContext('ADMIN'), {
                mfaPolicy: 'REQUIRED',
            } as never),
        ).rejects.toThrow(/at least one admin must be enrolled/);
        // Regression: a bug that flipped the policy first and counted
        // later would lock every admin out and require manual DB
        // surgery to recover.
        expect(mockSettingsUpsert).not.toHaveBeenCalled();
    });

    it('accepts REQUIRED when at least one admin has verified MFA', async () => {
        mockMembershipFind.mockResolvedValue([
            { userId: 'admin-1' },
            { userId: 'admin-2' },
        ] as never);
        mockEnrollCount.mockResolvedValue(1); // exactly one enrolled

        const r = await updateTenantMfaPolicy(makeRequestContext('ADMIN'), {
            mfaPolicy: 'REQUIRED',
        } as never);

        expect(mockSettingsUpsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { tenantId: 'tenant-1' },
                create: expect.objectContaining({ mfaPolicy: 'REQUIRED' }),
                update: expect.objectContaining({ mfaPolicy: 'REQUIRED' }),
            }),
        );
        expect(r).toBeTruthy();
    });

    it('skips the lockout check when policy is OPTIONAL', async () => {
        await updateTenantMfaPolicy(makeRequestContext('ADMIN'), {
            mfaPolicy: 'OPTIONAL',
        } as never);
        // Regression: a bug that ran the count check on every policy
        // change would unnecessarily block OPTIONAL → DISABLED transitions.
        expect(mockEnrollCount).not.toHaveBeenCalled();
        expect(mockSettingsUpsert).toHaveBeenCalled();
    });

    it('skips the lockout check when policy is DISABLED', async () => {
        await updateTenantMfaPolicy(makeRequestContext('ADMIN'), {
            mfaPolicy: 'DISABLED',
        } as never);
        expect(mockEnrollCount).not.toHaveBeenCalled();
    });

    it('accepts REQUIRED on a tenant with zero ADMINs (no lockout possible)', async () => {
        mockMembershipFind.mockResolvedValue([] as never);
        // The check returns early because there are no admins to count.
        await updateTenantMfaPolicy(makeRequestContext('ADMIN'), {
            mfaPolicy: 'REQUIRED',
        } as never);
        expect(mockEnrollCount).not.toHaveBeenCalled(); // short-circuit
        expect(mockSettingsUpsert).toHaveBeenCalled();
    });

    it('admin-membership query is scoped to ctx.tenantId — never cross-tenant', async () => {
        mockMembershipFind.mockResolvedValue([{ userId: 'a' }] as never);
        mockEnrollCount.mockResolvedValue(1);
        await updateTenantMfaPolicy(makeRequestContext('ADMIN', { tenantId: 'tenant-X' }), {
            mfaPolicy: 'REQUIRED',
        } as never);
        expect(mockMembershipFind).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ tenantId: 'tenant-X', role: 'ADMIN' }),
            }),
        );
        expect(mockEnrollCount).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ tenantId: 'tenant-X', isVerified: true }),
            }),
        );
    });

    it('persists sessionMaxAgeMinutes when provided', async () => {
        await updateTenantMfaPolicy(makeRequestContext('ADMIN'), {
            mfaPolicy: 'OPTIONAL',
            sessionMaxAgeMinutes: 60,
        } as never);
        const upsertArgs = mockSettingsUpsert.mock.calls[0][0];
        expect(upsertArgs.create.sessionMaxAgeMinutes).toBe(60);
        expect(upsertArgs.update.sessionMaxAgeMinutes).toBe(60);
    });

    it('persists null sessionMaxAgeMinutes when omitted', async () => {
        await updateTenantMfaPolicy(makeRequestContext('ADMIN'), {
            mfaPolicy: 'OPTIONAL',
        } as never);
        const upsertArgs = mockSettingsUpsert.mock.calls[0][0];
        expect(upsertArgs.create.sessionMaxAgeMinutes).toBeNull();
    });
});
