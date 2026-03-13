/**
 * Issue Policies - Role Matrix Tests
 */
import {
    assertCanReadIssues,
    assertCanCreateIssue,
    assertCanUpdateIssue,
    assertCanAssignIssue,
    assertCanResolveIssue,
    assertCanComment,
    assertCanManageLinks,
} from '@/app-layer/policies/issue.policies';
import type { RequestContext } from '@/app-layer/types';

function makeCtx(role: 'ADMIN' | 'EDITOR' | 'READER' | 'AUDITOR'): RequestContext {
    const canWrite = role === 'ADMIN' || role === 'EDITOR';
    const canAdmin = role === 'ADMIN';
    const canAudit = role === 'AUDITOR' || role === 'ADMIN';
    return {
        requestId: 'test-req',
        userId: 'user-1',
        tenantId: 'tenant-1',
        role,
        permissions: {
            canRead: true,
            canWrite,
            canAdmin,
            canAudit,
            canExport: canAdmin || canAudit,
        },
    };
}

describe('Issue Policies', () => {
    describe('assertCanReadIssues', () => {
        it.each(['ADMIN', 'EDITOR', 'READER', 'AUDITOR'] as const)('%s can read', (role) => {
            expect(() => assertCanReadIssues(makeCtx(role))).not.toThrow();
        });
    });

    describe('assertCanCreateIssue', () => {
        it.each(['ADMIN', 'EDITOR'] as const)('%s can create', (role) => {
            expect(() => assertCanCreateIssue(makeCtx(role))).not.toThrow();
        });
        it.each(['READER', 'AUDITOR'] as const)('%s cannot create', (role) => {
            expect(() => assertCanCreateIssue(makeCtx(role))).toThrow();
        });
    });

    describe('assertCanUpdateIssue', () => {
        it.each(['ADMIN', 'EDITOR'] as const)('%s can update', (role) => {
            expect(() => assertCanUpdateIssue(makeCtx(role))).not.toThrow();
        });
        it.each(['READER', 'AUDITOR'] as const)('%s cannot update', (role) => {
            expect(() => assertCanUpdateIssue(makeCtx(role))).toThrow();
        });
    });

    describe('assertCanAssignIssue', () => {
        it.each(['ADMIN', 'EDITOR'] as const)('%s can assign', (role) => {
            expect(() => assertCanAssignIssue(makeCtx(role))).not.toThrow();
        });
        it.each(['READER', 'AUDITOR'] as const)('%s cannot assign', (role) => {
            expect(() => assertCanAssignIssue(makeCtx(role))).toThrow();
        });
    });

    describe('assertCanResolveIssue', () => {
        it.each(['ADMIN', 'EDITOR'] as const)('%s can resolve', (role) => {
            expect(() => assertCanResolveIssue(makeCtx(role))).not.toThrow();
        });
        it.each(['READER', 'AUDITOR'] as const)('%s cannot resolve', (role) => {
            expect(() => assertCanResolveIssue(makeCtx(role))).toThrow();
        });
    });

    describe('assertCanComment', () => {
        it.each(['ADMIN', 'EDITOR', 'AUDITOR'] as const)('%s can comment', (role) => {
            expect(() => assertCanComment(makeCtx(role))).not.toThrow();
        });
        it('READER cannot comment', () => {
            expect(() => assertCanComment(makeCtx('READER'))).toThrow();
        });
    });

    describe('assertCanManageLinks', () => {
        it.each(['ADMIN', 'EDITOR'] as const)('%s can manage links', (role) => {
            expect(() => assertCanManageLinks(makeCtx(role))).not.toThrow();
        });
        it.each(['READER', 'AUDITOR'] as const)('%s cannot manage links', (role) => {
            expect(() => assertCanManageLinks(makeCtx(role))).toThrow();
        });
    });
});
