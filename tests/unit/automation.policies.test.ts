/**
 * Unit Test: Automation RBAC policies.
 *
 * Automation rules fire side-effects (create tasks, hit webhooks) on
 * behalf of the tenant, so mutation is gated at ADMIN. This matrix
 * pins that contract so accidental widening breaks CI.
 */
import {
    assertCanReadAutomation,
    assertCanManageAutomation,
    assertCanExecuteAutomation,
    assertCanReadAutomationHistory,
} from '@/app-layer/automation/policies';
import type { RequestContext } from '@/app-layer/types';
import type { Role } from '@prisma/client';
import { getPermissionsForRole } from '@/lib/permissions';

function makeCtx(role: Role): RequestContext {
    const canRead = true;
    const canWrite = role === 'ADMIN' || role === 'EDITOR';
    const canAdmin = role === 'ADMIN';
    const canAudit = role === 'AUDITOR' || role === 'ADMIN';
    return {
        requestId: 'req-auto',
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
        appPermissions: getPermissionsForRole(role),
    };
}

describe('Automation Policies — RBAC matrix', () => {
    const roles: Role[] = ['ADMIN', 'EDITOR', 'READER', 'AUDITOR'];

    describe('assertCanReadAutomation', () => {
        it.each(roles)('%s can read automation rules', (role) => {
            expect(() => assertCanReadAutomation(makeCtx(role))).not.toThrow();
        });
    });

    describe('assertCanManageAutomation', () => {
        it('ADMIN can manage', () => {
            expect(() => assertCanManageAutomation(makeCtx('ADMIN'))).not.toThrow();
        });

        it.each(['EDITOR', 'READER', 'AUDITOR'] as Role[])(
            '%s cannot manage',
            (role) => {
                expect(() =>
                    assertCanManageAutomation(makeCtx(role))
                ).toThrow(/permission/i);
            }
        );
    });

    describe('assertCanExecuteAutomation', () => {
        it('ADMIN can manually trigger', () => {
            expect(() => assertCanExecuteAutomation(makeCtx('ADMIN'))).not.toThrow();
        });

        it('EDITOR can manually trigger', () => {
            expect(() => assertCanExecuteAutomation(makeCtx('EDITOR'))).not.toThrow();
        });

        it.each(['READER', 'AUDITOR'] as Role[])(
            '%s cannot manually trigger',
            (role) => {
                expect(() =>
                    assertCanExecuteAutomation(makeCtx(role))
                ).toThrow(/permission/i);
            }
        );
    });

    describe('assertCanReadAutomationHistory', () => {
        it.each(roles)('%s can read execution history', (role) => {
            expect(() =>
                assertCanReadAutomationHistory(makeCtx(role))
            ).not.toThrow();
        });

        it('rejects a context with neither read nor audit', () => {
            const ctx: RequestContext = {
                ...makeCtx('READER'),
                permissions: {
                    canRead: false,
                    canWrite: false,
                    canAdmin: false,
                    canAudit: false,
                    canExport: false,
                },
            };
            expect(() => assertCanReadAutomationHistory(ctx)).toThrow(
                /permission/i
            );
        });
    });
});
