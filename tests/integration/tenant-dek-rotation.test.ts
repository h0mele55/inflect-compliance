/**
 * Integration test: per-tenant DEK rotation, end-to-end against a real DB.
 *
 * Replaces the original `tenant-dek-rotation-stub.test.ts` (which
 * asserted the stub-throw behaviour). The CHECK-constraint assertion
 * is preserved unchanged: it locks in the schema invariant that
 * `previousEncryptedDek != encryptedDek`, which the rotation control
 * flow trusts (a fresh `crypto.randomBytes(32)` could in theory
 * collide; the constraint catches operator-injected mistakes too).
 *
 * Behaviours covered:
 *
 *   1. `rotateTenantDek` swaps the DEK atomically — old wrapped DEK
 *      ends up in `previousEncryptedDek`; new wrapped DEK ends up in
 *      `encryptedDek`. The new DEK round-trips correctly under the
 *      master KEK.
 *
 *   2. While `previousEncryptedDek` is non-null, calling rotation
 *      again is rejected with the "already mid-rotation" error.
 *      Operator must wait for the sweep job to clear the column.
 *
 *   3. CHECK constraint (`Tenant_previousEncryptedDek_differs`)
 *      rejects an UPDATE that sets `previousEncryptedDek` equal to
 *      `encryptedDek`. Schema-level guard for silent key mixing.
 *
 *   4. The rotation enqueues a BullMQ job (best-effort assertion via
 *      a mock — full job execution is covered by the unit tests).
 */

import {
    rotateTenantDek,
    _resetTenantDekCache,
} from '@/lib/security/tenant-key-manager';
import { generateDek, wrapDek, unwrapDek } from '@/lib/security/tenant-keys';
import { DB_AVAILABLE } from './db-helper';
import { prismaTestClient } from '../helpers/db';
import type { PrismaClient } from '@prisma/client';

// Mock the BullMQ queue so we don't need Redis for an integration
// test focused on DB behaviour. Real job execution is covered by
// the unit-level tests in `tests/unit/tenant-key-manager.rotate.test.ts`.
jest.mock('@/app-layer/jobs/queue', () => ({
    enqueue: jest.fn().mockResolvedValue({ id: 'integration-test-job' }),
}));

const describeFn = DB_AVAILABLE ? describe : describe.skip;

describeFn('rotateTenantDek (integration — real DB)', () => {
    let prisma: PrismaClient;
    const slugs: string[] = [];

    beforeAll(async () => {
        prisma = prismaTestClient();
        await prisma.$connect();
    });

    afterAll(async () => {
        try {
            await prisma.tenant.deleteMany({
                where: { slug: { in: slugs } },
            });
        } catch {
            /* best effort */
        }
        await prisma.$disconnect();
    });

    beforeEach(() => {
        _resetTenantDekCache();
    });

    test('atomically swaps encryptedDek and populates previousEncryptedDek', async () => {
        const slug = `rot-happy-${Date.now()}`;
        slugs.push(slug);
        const initialDek = generateDek();
        const initialWrapped = wrapDek(initialDek);

        const tenant = await prisma.tenant.create({
            data: {
                name: 'rot-happy',
                slug,
                encryptedDek: initialWrapped,
            },
        });

        const result = await rotateTenantDek({
            tenantId: tenant.id,
            initiatedByUserId: 'user-int-1',
        });
        expect(result.tenantId).toBe(tenant.id);
        expect(typeof result.jobId).toBe('string');
        expect(result.jobId.length).toBeGreaterThan(0);

        const after = await prisma.tenant.findUnique({
            where: { id: tenant.id },
            select: {
                encryptedDek: true,
                previousEncryptedDek: true,
            },
        });

        // Previous slot now carries the OLD wrapped DEK.
        expect(after?.previousEncryptedDek).toBe(initialWrapped);
        // Primary slot has a NEW wrapped DEK (different bytes).
        expect(after?.encryptedDek).not.toBe(initialWrapped);
        // The new wrapped DEK round-trips to a 32-byte key.
        const recovered = unwrapDek(after!.encryptedDek!);
        expect(recovered.length).toBe(32);
        // ...and is NOT equal to the original DEK.
        expect(recovered.equals(initialDek)).toBe(false);
    });

    test('rejects a second rotation while the previous slot is still populated', async () => {
        const slug = `rot-double-${Date.now()}`;
        slugs.push(slug);
        const tenant = await prisma.tenant.create({
            data: {
                name: 'rot-double',
                slug,
                encryptedDek: wrapDek(generateDek()),
            },
        });

        // First rotation succeeds and leaves previousEncryptedDek set.
        await rotateTenantDek({
            tenantId: tenant.id,
            initiatedByUserId: 'user-int-2',
        });

        // Second attempt is refused — operator must wait for the sweep.
        await expect(
            rotateTenantDek({
                tenantId: tenant.id,
                initiatedByUserId: 'user-int-2',
            }),
        ).rejects.toThrow(/already mid-rotation/);
    });

    test('CHECK constraint rejects identical DEK values — silent-key-mixing guard', async () => {
        // Schema-level invariant. The rotation flow trusts this — if
        // somehow encryptedDek and previousEncryptedDek end up equal
        // after a successful UPDATE, the constraint would have
        // already rejected the write. Test it directly.
        const slug = `rot-constraint-${Date.now()}`;
        slugs.push(slug);
        const t = await prisma.tenant.create({
            data: {
                name: 'rot-constraint',
                slug,
                encryptedDek: 'v1:dGVzdA==',
            },
        });
        await expect(
            prisma.tenant.update({
                where: { id: t.id },
                data: { previousEncryptedDek: 'v1:dGVzdA==' },
            }),
        ).rejects.toThrow(/Tenant_previousEncryptedDek_differs|check constraint/i);
    });
});
