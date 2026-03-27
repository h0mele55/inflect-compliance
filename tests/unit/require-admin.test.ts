/**
 * Unit tests for src/lib/auth/require-admin.ts
 *
 * Tests the server-side admin/write/role authorization guards.
 * Mocks getTenantCtx to isolate role enforcement logic.
 */

// ─── Mocks ───

const mockGetTenantCtx = jest.fn();
jest.mock('@/app-layer/context', () => ({
    getTenantCtx: (...args: unknown[]) => mockGetTenantCtx(...args),
}));

import { requireAdminCtx, requireWriteCtx, requireRoleCtx } from '@/lib/auth/require-admin';
import { AppError } from '@/lib/errors/types';
import type { RequestContext } from '@/app-layer/types';

// ─── Helpers ───

function makeCtx(role: string): RequestContext {
    return {
        requestId: 'test-req-1',
        userId: 'user-1',
        tenantId: 'tenant-1',
        tenantSlug: 'acme',
        role: role as RequestContext['role'],
        permissions: {
            canRead: true,
            canWrite: role === 'ADMIN' || role === 'EDITOR',
            canAdmin: role === 'ADMIN',
            canAudit: role === 'AUDITOR' || role === 'ADMIN',
            canExport: role !== 'READER',
        },
    };
}

const params = { tenantSlug: 'acme' };

// ─── Tests ───

describe('requireAdminCtx', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns context for ADMIN role', async () => {
        const ctx = makeCtx('ADMIN');
        mockGetTenantCtx.mockResolvedValue(ctx);

        const result = await requireAdminCtx(params);

        expect(result).toBe(ctx);
        expect(result.role).toBe('ADMIN');
        expect(mockGetTenantCtx).toHaveBeenCalledWith(params, undefined);
    });

    it('throws 403 for EDITOR role', async () => {
        mockGetTenantCtx.mockResolvedValue(makeCtx('EDITOR'));

        await expect(requireAdminCtx(params)).rejects.toThrow(AppError);
        await expect(requireAdminCtx(params)).rejects.toMatchObject({
            status: 403,
            code: 'FORBIDDEN',
            message: 'Admin access required',
        });
    });

    it('throws 403 for AUDITOR role', async () => {
        mockGetTenantCtx.mockResolvedValue(makeCtx('AUDITOR'));

        await expect(requireAdminCtx(params)).rejects.toThrow(AppError);
        await expect(requireAdminCtx(params)).rejects.toMatchObject({
            status: 403,
        });
    });

    it('throws 403 for READER role', async () => {
        mockGetTenantCtx.mockResolvedValue(makeCtx('READER'));

        await expect(requireAdminCtx(params)).rejects.toThrow(AppError);
        await expect(requireAdminCtx(params)).rejects.toMatchObject({
            status: 403,
        });
    });

    it('passes through 401 when not authenticated', async () => {
        const unauthorizedError = new AppError('Unauthorized', 'UNAUTHORIZED', 401);
        mockGetTenantCtx.mockRejectedValue(unauthorizedError);

        await expect(requireAdminCtx(params)).rejects.toThrow(AppError);
        await expect(requireAdminCtx(params)).rejects.toMatchObject({
            status: 401,
            code: 'UNAUTHORIZED',
        });
    });

    it('passes through 403 when not a tenant member', async () => {
        const forbiddenError = new AppError('Not a member of this tenant', 'FORBIDDEN', 403);
        mockGetTenantCtx.mockRejectedValue(forbiddenError);

        await expect(requireAdminCtx(params)).rejects.toThrow(AppError);
        await expect(requireAdminCtx(params)).rejects.toMatchObject({
            status: 403,
            message: 'Not a member of this tenant',
        });
    });

    it('forwards NextRequest to getTenantCtx', async () => {
        const ctx = makeCtx('ADMIN');
        mockGetTenantCtx.mockResolvedValue(ctx);

        const mockReq = { headers: new Headers() } as unknown;
        await requireAdminCtx(params, mockReq as Parameters<typeof requireAdminCtx>[1]);

        expect(mockGetTenantCtx).toHaveBeenCalledWith(params, mockReq);
    });
});

describe('requireWriteCtx', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns context for ADMIN role', async () => {
        const ctx = makeCtx('ADMIN');
        mockGetTenantCtx.mockResolvedValue(ctx);

        const result = await requireWriteCtx(params);
        expect(result).toBe(ctx);
    });

    it('returns context for EDITOR role', async () => {
        const ctx = makeCtx('EDITOR');
        mockGetTenantCtx.mockResolvedValue(ctx);

        const result = await requireWriteCtx(params);
        expect(result).toBe(ctx);
    });

    it('throws 403 for AUDITOR role', async () => {
        mockGetTenantCtx.mockResolvedValue(makeCtx('AUDITOR'));

        await expect(requireWriteCtx(params)).rejects.toThrow(AppError);
        await expect(requireWriteCtx(params)).rejects.toMatchObject({
            status: 403,
            message: 'Write access required',
        });
    });

    it('throws 403 for READER role', async () => {
        mockGetTenantCtx.mockResolvedValue(makeCtx('READER'));

        await expect(requireWriteCtx(params)).rejects.toThrow(AppError);
        await expect(requireWriteCtx(params)).rejects.toMatchObject({
            status: 403,
        });
    });
});

describe('requireRoleCtx', () => {
    beforeEach(() => jest.clearAllMocks());

    it('allows ADMIN when minimum is READER', async () => {
        const ctx = makeCtx('ADMIN');
        mockGetTenantCtx.mockResolvedValue(ctx);

        const result = await requireRoleCtx(params, 'READER');
        expect(result).toBe(ctx);
    });

    it('allows EDITOR when minimum is EDITOR', async () => {
        const ctx = makeCtx('EDITOR');
        mockGetTenantCtx.mockResolvedValue(ctx);

        const result = await requireRoleCtx(params, 'EDITOR');
        expect(result).toBe(ctx);
    });

    it('throws 403 for READER when minimum is EDITOR', async () => {
        mockGetTenantCtx.mockResolvedValue(makeCtx('READER'));

        await expect(requireRoleCtx(params, 'EDITOR')).rejects.toThrow(AppError);
        await expect(requireRoleCtx(params, 'EDITOR')).rejects.toMatchObject({
            status: 403,
            message: 'EDITOR access required',
        });
    });

    it('throws 403 for EDITOR when minimum is ADMIN', async () => {
        mockGetTenantCtx.mockResolvedValue(makeCtx('EDITOR'));

        await expect(requireRoleCtx(params, 'ADMIN')).rejects.toThrow(AppError);
        await expect(requireRoleCtx(params, 'ADMIN')).rejects.toMatchObject({
            status: 403,
            message: 'ADMIN access required',
        });
    });
});
