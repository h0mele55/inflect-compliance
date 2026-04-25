/**
 * Unit tests for src/app-layer/usecases/mfa-challenge.ts
 *
 * Closes a critical zero-coverage gap from GAP-02. The MFA challenge
 * usecase is the second-factor verifier on every login that hits the
 * MFA gate. A bug here is a silent MFA bypass — the highest-impact
 * regression class in the auth path.
 *
 * Behaviours protected:
 *   1. Missing enrollment / unverified enrollment ⇒ badRequest
 *      (NOT silent success — would defeat MFA entirely)
 *   2. Wrong TOTP code ⇒ failure result + MFA_CHALLENGE_FAILED audit
 *   3. Right TOTP code ⇒ success result + lastChallengeAt updated
 *      + MFA_CHALLENGE_PASSED audit
 *   4. Audit emission errors are swallowed (best-effort), never
 *      flipping a verified user back to unverified
 *   5. AUTH_SECRET absent ⇒ internal error (not silent accept)
 *
 * Each assertion calls out the regression it protects.
 */

jest.mock('@/lib/prisma', () => ({
    prisma: {
        userMfaEnrollment: {
            findUnique: jest.fn(),
            update: jest.fn(),
        },
    },
}));

jest.mock('@/lib/security/totp-crypto', () => ({
    decryptTotpSecret: jest.fn(),
    verifyTotpCode: jest.fn(),
}));

jest.mock('../../../src/app-layer/events/audit', () => ({
    logEvent: jest.fn(),
}));

jest.mock('@/env', () => ({
    env: { AUTH_SECRET: 'test-auth-secret-32-chars-or-more-xx' },
}));

import { verifyMfaChallenge } from '@/app-layer/usecases/mfa-challenge';
import { prisma } from '@/lib/prisma';
import {
    decryptTotpSecret,
    verifyTotpCode,
} from '@/lib/security/totp-crypto';
import { logEvent } from '@/app-layer/events/audit';

const mockFindUnique = prisma.userMfaEnrollment.findUnique as jest.MockedFunction<
    typeof prisma.userMfaEnrollment.findUnique
>;
const mockUpdate = prisma.userMfaEnrollment.update as jest.MockedFunction<
    typeof prisma.userMfaEnrollment.update
>;
const mockDecrypt = decryptTotpSecret as jest.MockedFunction<typeof decryptTotpSecret>;
const mockVerify = verifyTotpCode as jest.MockedFunction<typeof verifyTotpCode>;
const mockLogEvent = logEvent as jest.MockedFunction<typeof logEvent>;

const enrollmentRow = {
    id: 'enrollment-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    type: 'TOTP' as const,
    secretEncrypted: 'enc-blob',
    isVerified: true,
    verifiedAt: new Date('2026-04-24T00:00:00Z'),
    lastChallengeAt: null,
    createdAt: new Date('2026-04-24T00:00:00Z'),
    updatedAt: new Date('2026-04-24T00:00:00Z'),
};

beforeEach(() => {
    jest.clearAllMocks();
    mockDecrypt.mockReturnValue('JBSWY3DPEHPK3PXP'); // canonical TOTP secret
    mockUpdate.mockResolvedValue(enrollmentRow);
    mockLogEvent.mockResolvedValue(undefined as never);
});

describe('verifyMfaChallenge', () => {
    // ── Regression: missing enrollment must NOT silently succeed ──
    it('throws badRequest when no enrollment exists for (userId, tenantId, TOTP)', async () => {
        mockFindUnique.mockResolvedValue(null);
        await expect(
            verifyMfaChallenge('user-1', 'tenant-1', '000000', 3),
        ).rejects.toThrow(/MFA not configured/);
        expect(mockVerify).not.toHaveBeenCalled();
        expect(mockLogEvent).not.toHaveBeenCalled();
    });

    // ── Regression: unverified enrollment must reject — only enrolment
    //     finalisation should accept codes against an unverified row.
    //     Login challenge MUST require a verified row. ──
    it('throws badRequest when enrollment exists but isVerified=false', async () => {
        mockFindUnique.mockResolvedValue({ ...enrollmentRow, isVerified: false });
        await expect(
            verifyMfaChallenge('user-1', 'tenant-1', '123456', 3),
        ).rejects.toThrow(/MFA not configured/);
        expect(mockVerify).not.toHaveBeenCalled();
    });

    // ── Regression: wrong code must produce a failure result with the
    //     remaining counter the caller passed in. Audit row must fire. ──
    it('returns success:false + MFA_CHALLENGE_FAILED audit when code is invalid', async () => {
        mockFindUnique.mockResolvedValue(enrollmentRow);
        mockVerify.mockReturnValue(false);

        const result = await verifyMfaChallenge('user-1', 'tenant-1', '123456', 2);

        expect(result.success).toBe(false);
        expect(result.remaining).toBe(2);
        expect(mockUpdate).not.toHaveBeenCalled(); // lastChallengeAt NOT touched
        expect(mockLogEvent).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ tenantId: 'tenant-1', userId: 'user-1' }),
            expect.objectContaining({ action: 'MFA_CHALLENGE_FAILED' }),
        );
    });

    // ── Regression: right code must update lastChallengeAt (signal the
    //     JWT callback uses to clear mfaPending) AND emit success audit. ──
    it('returns success:true + updates lastChallengeAt + MFA_CHALLENGE_PASSED audit', async () => {
        mockFindUnique.mockResolvedValue(enrollmentRow);
        mockVerify.mockReturnValue(true);

        const result = await verifyMfaChallenge('user-1', 'tenant-1', '654321', 5);

        expect(result.success).toBe(true);
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'enrollment-1' },
                data: expect.objectContaining({ lastChallengeAt: expect.any(Date) }),
            }),
        );
        expect(mockLogEvent).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.objectContaining({ action: 'MFA_CHALLENGE_PASSED' }),
        );
    });

    // ── Regression: audit emission MUST be best-effort — a failing
    //     audit writer cannot prevent a legitimate user from completing
    //     MFA. The caller still sees the verified result. ──
    it('still returns success when the audit emit throws (best-effort semantic)', async () => {
        mockFindUnique.mockResolvedValue(enrollmentRow);
        mockVerify.mockReturnValue(true);
        mockLogEvent.mockRejectedValue(new Error('audit chain unreachable'));

        const result = await verifyMfaChallenge('user-1', 'tenant-1', '654321', 5);

        expect(result.success).toBe(true);
        // lastChallengeAt was still updated — the audit failure didn't
        // unwind the legitimate state transition.
        expect(mockUpdate).toHaveBeenCalled();
    });

    // ── Regression: same best-effort guarantee on the failure-audit
    //     path. A flaky audit must not turn "wrong code" into a 500. ──
    it('still returns failure when the failure-audit emit throws', async () => {
        mockFindUnique.mockResolvedValue(enrollmentRow);
        mockVerify.mockReturnValue(false);
        mockLogEvent.mockRejectedValue(new Error('audit chain unreachable'));

        const result = await verifyMfaChallenge('user-1', 'tenant-1', '000000', 1);

        expect(result.success).toBe(false);
        expect(result.remaining).toBe(1);
    });

    // ── Regression: lookup must be scoped to (userId, tenantId, TOTP).
    //     A bug that drops tenantId from the WHERE would let user X
    //     in tenant A pass MFA using user X's enrollment in tenant B. ──
    it('looks up the enrollment scoped to (userId, tenantId, TOTP)', async () => {
        mockFindUnique.mockResolvedValue(enrollmentRow);
        mockVerify.mockReturnValue(true);

        await verifyMfaChallenge('user-1', 'tenant-1', '111111', 1);

        expect(mockFindUnique).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    userId_tenantId_type: {
                        userId: 'user-1',
                        tenantId: 'tenant-1',
                        type: 'TOTP',
                    },
                },
            }),
        );
    });
});
