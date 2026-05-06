/* eslint-disable @typescript-eslint/no-explicit-any -- test
 * mocks, fixtures, and adapter shims that mirror runtime contracts
 * (Prisma extensions, NextRequest mocks, JSON-loaded fixtures,
 * spy harnesses). Per-line typing has poor cost/benefit ratio in
 * test files; the file-level disable is the codebase's standard
 * pattern for these surfaces (see also
 * tests/guards/helm-chart-foundation.test.ts and
 * tests/integration/audit-middleware.test.ts). */
/**
 * Integration tests: tenant isolation enforcement.
 *
 * Tests:
 * 1. Tenant membership required — resolveTenantContext throws forbidden without it
 * 2. Cross-tenant data access blocked — cannot resolve context for a different tenant
 * 3. Default tenant resolver returns first membership
 * 4. Permission computation
 */

import {
    resolveTenantContext,
    getDefaultTenantForUser,
    computePermissions,
} from '@/lib/tenant-context';

// ─── Mocks ───

// We mock prisma directly to avoid needing a running DB
jest.mock('@/lib/prisma', () => {
    const tenants = [
        { id: 'tenant-a', slug: 'acme-corp', name: 'Acme Corp' },
        { id: 'tenant-b', slug: 'evil-corp', name: 'Evil Corp' },
    ];

    const memberships = [
        { id: 'mem-a', tenantId: 'tenant-a', userId: 'user-1', role: 'EDITOR', createdAt: new Date('2024-01-01') },
        { id: 'mem-b', tenantId: 'tenant-b', userId: 'user-2', role: 'ADMIN', createdAt: new Date('2024-01-01') },
    ];

    return {
        __esModule: true,
        default: {
            tenant: {
                findUnique: jest.fn(async ({ where }: any) => {
                    if (where.slug) return tenants.find(t => t.slug === where.slug) || null;
                    if (where.id) return tenants.find(t => t.id === where.id) || null;
                    return null;
                }),
            },
            tenantMembership: {
                findUnique: jest.fn(async ({ where }: any) => {
                    const key = where.tenantId_userId;
                    if (!key) return null;
                    return memberships.find(
                        m => m.tenantId === key.tenantId && m.userId === key.userId
                    ) || null;
                }),
                findFirst: jest.fn(async ({ where, include }: any) => {
                    const mem = memberships.find(m => m.userId === where.userId);
                    if (!mem) return null;
                    const tenant = tenants.find(t => t.id === mem.tenantId);
                    return include?.tenant ? { ...mem, tenant } : mem;
                }),
            },
        },
    };
});

describe('Tenant Isolation Integration', () => {
    // ─── 1. Tenant membership required ───
    describe('tenant membership required', () => {
        it('resolves context for a member', async () => {
            const ctx = await resolveTenantContext(
                { tenantSlug: 'acme-corp' },
                'user-1'
            );
            expect(ctx.tenant.id).toBe('tenant-a');
            expect(ctx.role).toBe('EDITOR');
            expect(ctx.permissions.canRead).toBe(true);
            expect(ctx.permissions.canWrite).toBe(true);
            expect(ctx.permissions.canAdmin).toBe(false);
        });

        it('throws forbidden for non-member', async () => {
            await expect(
                resolveTenantContext({ tenantSlug: 'acme-corp' }, 'user-999')
            ).rejects.toThrow(/not a member/i);
        });

        it('throws notFound for non-existent tenant', async () => {
            await expect(
                resolveTenantContext({ tenantSlug: 'ghost-corp' }, 'user-1')
            ).rejects.toThrow(/not found/i);
        });
    });

    // ─── 2. Cross-tenant data access blocked ───
    describe('cross-tenant data access blocked', () => {
        it('user-1 cannot access tenant-b', async () => {
            await expect(
                resolveTenantContext({ tenantSlug: 'evil-corp' }, 'user-1')
            ).rejects.toThrow(/not a member/i);
        });

        it('user-2 cannot access tenant-a', async () => {
            await expect(
                resolveTenantContext({ tenantSlug: 'acme-corp' }, 'user-2')
            ).rejects.toThrow(/not a member/i);
        });
    });

    // ─── 3. Default tenant resolver ───
    describe('default tenant resolver', () => {
        it('returns first membership for user with memberships', async () => {
            const result = await getDefaultTenantForUser('user-1');
            expect(result).not.toBeNull();
            expect(result!.tenant.slug).toBe('acme-corp');
        });

        it('returns null for user with no memberships', async () => {
            const result = await getDefaultTenantForUser('user-999');
            expect(result).toBeNull();
        });
    });

    // ─── 4. Permission computation ───
    describe('permission computation', () => {
        it('ADMIN has all permissions', () => {
            const p = computePermissions('ADMIN' as any);
            expect(p).toEqual({
                canRead: true, canWrite: true, canAdmin: true,
                canAudit: true, canExport: true,
            });
        });

        it('READER has only read', () => {
            const p = computePermissions('READER' as any);
            expect(p).toEqual({
                canRead: true, canWrite: false, canAdmin: false,
                canAudit: false, canExport: false,
            });
        });

        it('AUDITOR has read + audit + export', () => {
            const p = computePermissions('AUDITOR' as any);
            expect(p).toEqual({
                canRead: true, canWrite: false, canAdmin: false,
                canAudit: true, canExport: true,
            });
        });
    });
});
