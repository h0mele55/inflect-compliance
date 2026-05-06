/* eslint-disable @typescript-eslint/no-explicit-any -- test
 * mocks, fixtures, and adapter shims that mirror runtime contracts
 * (Prisma extensions, NextRequest mocks, JSON-loaded fixtures,
 * spy harnesses). Per-line typing has poor cost/benefit ratio in
 * test files; the file-level disable is the codebase's standard
 * pattern for these surfaces (see also
 * tests/guards/helm-chart-foundation.test.ts and
 * tests/integration/audit-middleware.test.ts). */
import { assertCanRead, assertCanWrite, assertCanAdmin, assertCanAudit } from '@/app-layer/policies/common';
import { RequestContext } from '@/app-layer/types';
import { getPermissionsForRole } from '@/lib/permissions';

describe('Application Layer Policies', () => {
    let baseCtx: RequestContext;

    beforeEach(() => {
        baseCtx = {
            requestId: 'req-123',
            userId: 'user-1',
            tenantId: 'tenant-1',
            role: 'READER' as any,
            permissions: { canRead: false, canWrite: false, canAdmin: false, canAudit: false, canExport: false },
            appPermissions: getPermissionsForRole('READER'),
        };
    });

    describe('assertCanRead', () => {
        it('allows if canRead is true', () => {
            expect(() => assertCanRead({ ...baseCtx, permissions: { ...baseCtx.permissions, canRead: true } })).not.toThrow();
        });
        it('denies if canRead is false', () => {
            expect(() => assertCanRead({ ...baseCtx, permissions: { ...baseCtx.permissions, canRead: false } })).toThrow('permission');
        });
    });

    describe('assertCanWrite', () => {
        it('allows if canWrite is true', () => {
            expect(() => assertCanWrite({ ...baseCtx, permissions: { ...baseCtx.permissions, canWrite: true } })).not.toThrow();
        });

        it('denies if canWrite is false', () => {
            expect(() => assertCanWrite({ ...baseCtx, permissions: { ...baseCtx.permissions, canWrite: false } })).toThrow('permission');
        });
    });

    describe('assertCanAdmin', () => {
        it('allows if canAdmin is true', () => {
            expect(() => assertCanAdmin({ ...baseCtx, permissions: { ...baseCtx.permissions, canAdmin: true } })).not.toThrow();
        });

        it('denies if canAdmin is false', () => {
            expect(() => assertCanAdmin({ ...baseCtx, permissions: { ...baseCtx.permissions, canAdmin: false } })).toThrow('permission');
        });
    });

    describe('assertCanAudit', () => {
        it('allows if canAudit is true', () => {
            expect(() => assertCanAudit({ ...baseCtx, permissions: { ...baseCtx.permissions, canAudit: true } })).not.toThrow();
        });

        it('denies if canAudit is false', () => {
            expect(() => assertCanAudit({ ...baseCtx, permissions: { ...baseCtx.permissions, canAudit: false } })).toThrow('permission');
        });
    });
});
