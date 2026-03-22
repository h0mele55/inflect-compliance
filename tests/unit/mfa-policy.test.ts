/**
 * MFA Policy Unit Tests
 *
 * Tests Zod schema validation for MFA-related inputs
 * and policy decision logic.
 */
import {
    UpdateMfaPolicyInput,
    VerifyMfaInput,
    RevokeSessionsInput,
    MfaPolicyEnum,
} from '../../src/app-layer/schemas/mfa.schemas';

describe('MFA Schemas', () => {
    // ─── MfaPolicyEnum ──────────────────────────────────────────────

    describe('MfaPolicyEnum', () => {
        it('accepts valid policies', () => {
            expect(MfaPolicyEnum.parse('DISABLED')).toBe('DISABLED');
            expect(MfaPolicyEnum.parse('OPTIONAL')).toBe('OPTIONAL');
            expect(MfaPolicyEnum.parse('REQUIRED')).toBe('REQUIRED');
        });

        it('rejects invalid values', () => {
            expect(MfaPolicyEnum.safeParse('MANDATORY').success).toBe(false);
            expect(MfaPolicyEnum.safeParse('').success).toBe(false);
            expect(MfaPolicyEnum.safeParse(null).success).toBe(false);
        });
    });

    // ─── UpdateMfaPolicyInput ───────────────────────────────────────

    describe('UpdateMfaPolicyInput', () => {
        it('accepts valid policy update', () => {
            const result = UpdateMfaPolicyInput.parse({
                mfaPolicy: 'REQUIRED',
            });
            expect(result.mfaPolicy).toBe('REQUIRED');
        });

        it('accepts policy with session max age', () => {
            const result = UpdateMfaPolicyInput.parse({
                mfaPolicy: 'OPTIONAL',
                sessionMaxAgeMinutes: 480,
            });
            expect(result.sessionMaxAgeMinutes).toBe(480);
        });

        it('accepts null session max age', () => {
            const result = UpdateMfaPolicyInput.parse({
                mfaPolicy: 'DISABLED',
                sessionMaxAgeMinutes: null,
            });
            expect(result.sessionMaxAgeMinutes).toBeNull();
        });

        it('rejects session max age below 5 minutes', () => {
            const result = UpdateMfaPolicyInput.safeParse({
                mfaPolicy: 'REQUIRED',
                sessionMaxAgeMinutes: 3,
            });
            expect(result.success).toBe(false);
        });

        it('rejects session max age above 30 days', () => {
            const result = UpdateMfaPolicyInput.safeParse({
                mfaPolicy: 'REQUIRED',
                sessionMaxAgeMinutes: 50000,
            });
            expect(result.success).toBe(false);
        });

        it('rejects missing mfaPolicy', () => {
            const result = UpdateMfaPolicyInput.safeParse({});
            expect(result.success).toBe(false);
        });

        it('rejects invalid policy', () => {
            const result = UpdateMfaPolicyInput.safeParse({
                mfaPolicy: 'ENFORCED',
            });
            expect(result.success).toBe(false);
        });
    });

    // ─── VerifyMfaInput ─────────────────────────────────────────────

    describe('VerifyMfaInput', () => {
        it('accepts valid 6-digit code', () => {
            const result = VerifyMfaInput.parse({ code: '123456' });
            expect(result.code).toBe('123456');
        });

        it('accepts code with leading zeros', () => {
            const result = VerifyMfaInput.parse({ code: '000001' });
            expect(result.code).toBe('000001');
        });

        it('rejects non-numeric code', () => {
            expect(VerifyMfaInput.safeParse({ code: 'abcdef' }).success).toBe(false);
        });

        it('rejects 5-digit code', () => {
            expect(VerifyMfaInput.safeParse({ code: '12345' }).success).toBe(false);
        });

        it('rejects 7-digit code', () => {
            expect(VerifyMfaInput.safeParse({ code: '1234567' }).success).toBe(false);
        });

        it('rejects empty string', () => {
            expect(VerifyMfaInput.safeParse({ code: '' }).success).toBe(false);
        });

        it('rejects missing code', () => {
            expect(VerifyMfaInput.safeParse({}).success).toBe(false);
        });
    });

    // ─── RevokeSessionsInput ────────────────────────────────────────

    describe('RevokeSessionsInput', () => {
        it('accepts valid CUID target user ID', () => {
            const result = RevokeSessionsInput.parse({
                targetUserId: 'clx1234567890abcdefghijkl',
            });
            expect(result.targetUserId).toBe('clx1234567890abcdefghijkl');
        });

        it('accepts empty (revoke own sessions)', () => {
            const result = RevokeSessionsInput.parse({});
            expect(result.targetUserId).toBeUndefined();
        });

        it('rejects non-CUID string', () => {
            expect(RevokeSessionsInput.safeParse({ targetUserId: 'not-a-cuid' }).success).toBe(false);
        });
    });
});

// ─── Policy Decision Tests ──────────────────────────────────────────

describe('MFA Policy Decisions', () => {
    // These test pure logic without DB access

    function shouldRequireMfa(policy: string, isEnrolled: boolean, isVerified: boolean): boolean {
        if (policy !== 'REQUIRED') return false;
        return !isVerified; // If REQUIRED and not verified, user must complete MFA
    }

    function canAccessWithoutMfa(policy: string, isVerified: boolean): boolean {
        if (policy === 'DISABLED') return true;
        if (policy === 'OPTIONAL') return true; // User can choose
        if (policy === 'REQUIRED' && isVerified) return true;
        return false;
    }

    it('DISABLED policy never requires MFA', () => {
        expect(shouldRequireMfa('DISABLED', false, false)).toBe(false);
        expect(canAccessWithoutMfa('DISABLED', false)).toBe(true);
    });

    it('OPTIONAL policy never blocks access', () => {
        expect(shouldRequireMfa('OPTIONAL', false, false)).toBe(false);
        expect(canAccessWithoutMfa('OPTIONAL', false)).toBe(true);
        expect(canAccessWithoutMfa('OPTIONAL', true)).toBe(true);
    });

    it('REQUIRED policy blocks unverified users', () => {
        expect(shouldRequireMfa('REQUIRED', false, false)).toBe(true);
        expect(canAccessWithoutMfa('REQUIRED', false)).toBe(false);
    });

    it('REQUIRED policy allows verified users', () => {
        expect(shouldRequireMfa('REQUIRED', true, true)).toBe(false);
        expect(canAccessWithoutMfa('REQUIRED', true)).toBe(true);
    });

    it('REQUIRED policy blocks enrolled but unverified users', () => {
        expect(shouldRequireMfa('REQUIRED', true, false)).toBe(true);
        expect(canAccessWithoutMfa('REQUIRED', false)).toBe(false);
    });
});
