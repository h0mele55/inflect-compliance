/**
 * Unit Test: Risk-specific RBAC policies.
 * Tests the complete role matrix for risk operations.
 */
import {
    assertCanReadRisk,
    assertCanCreateRisk,
    assertCanUpdateRisk,
    assertCanSetStatus,
    assertCanMapControls,
} from '@/app-layer/policies/risk.policies';
import { RequestContext } from '@/app-layer/types';
import { Role } from '@prisma/client';

function makeCtx(role: Role): RequestContext {
    const canRead = true; // All roles can read
    const canWrite = role === 'ADMIN' || role === 'EDITOR';
    const canAdmin = role === 'ADMIN';
    const canAudit = role === 'AUDITOR' || role === 'ADMIN';

    return {
        requestId: 'test-req-123',
        userId: 'user-1',
        tenantId: 'tenant-1',
        role,
        permissions: {
            canRead,
            canWrite,
            canAdmin,
            canAudit,
            canExport: canRead,
        },
    };
}

describe('Risk Policies - RBAC Matrix', () => {
    const roles: Role[] = ['ADMIN', 'EDITOR', 'READER', 'AUDITOR'];

    describe('assertCanReadRisk', () => {
        it.each(roles)('%s can read risks', (role) => {
            expect(() => assertCanReadRisk(makeCtx(role))).not.toThrow();
        });
    });

    describe('assertCanCreateRisk', () => {
        it('ADMIN can create risks', () => {
            expect(() => assertCanCreateRisk(makeCtx('ADMIN'))).not.toThrow();
        });

        it('EDITOR can create risks', () => {
            expect(() => assertCanCreateRisk(makeCtx('EDITOR'))).not.toThrow();
        });

        it('READER cannot create risks', () => {
            expect(() => assertCanCreateRisk(makeCtx('READER'))).toThrow('permission');
        });

        it('AUDITOR cannot create risks', () => {
            expect(() => assertCanCreateRisk(makeCtx('AUDITOR'))).toThrow('permission');
        });
    });

    describe('assertCanUpdateRisk', () => {
        it('ADMIN can update risks', () => {
            expect(() => assertCanUpdateRisk(makeCtx('ADMIN'))).not.toThrow();
        });

        it('EDITOR can update risks', () => {
            expect(() => assertCanUpdateRisk(makeCtx('EDITOR'))).not.toThrow();
        });

        it('READER cannot update risks', () => {
            expect(() => assertCanUpdateRisk(makeCtx('READER'))).toThrow('permission');
        });

        it('AUDITOR cannot update risks', () => {
            expect(() => assertCanUpdateRisk(makeCtx('AUDITOR'))).toThrow('permission');
        });
    });

    describe('assertCanSetStatus', () => {
        it('ADMIN can set status', () => {
            expect(() => assertCanSetStatus(makeCtx('ADMIN'))).not.toThrow();
        });

        it('EDITOR can set status', () => {
            expect(() => assertCanSetStatus(makeCtx('EDITOR'))).not.toThrow();
        });

        it('READER cannot set status', () => {
            expect(() => assertCanSetStatus(makeCtx('READER'))).toThrow('permission');
        });

        it('AUDITOR cannot set status', () => {
            expect(() => assertCanSetStatus(makeCtx('AUDITOR'))).toThrow('permission');
        });
    });

    describe('assertCanMapControls', () => {
        it('ADMIN can map controls', () => {
            expect(() => assertCanMapControls(makeCtx('ADMIN'))).not.toThrow();
        });

        it('EDITOR can map controls', () => {
            expect(() => assertCanMapControls(makeCtx('EDITOR'))).not.toThrow();
        });

        it('READER cannot map controls', () => {
            expect(() => assertCanMapControls(makeCtx('READER'))).toThrow('permission');
        });

        it('AUDITOR cannot map controls', () => {
            expect(() => assertCanMapControls(makeCtx('AUDITOR'))).toThrow('permission');
        });
    });
});
