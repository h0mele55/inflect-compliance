/**
 * Tests for the rotateTenantDek stub and the Tenant.previousEncryptedDek
 * schema additions landed in Epic B (DEK rotation surface reservation).
 *
 * When the real `rotateTenantDek` lands, the first test must be rewritten
 * (not deleted) to assert the success path. The second and third tests
 * stay as-is — they protect the schema, not the function behaviour.
 */

import { rotateTenantDek } from '@/lib/security/tenant-key-manager';
import { DB_AVAILABLE } from './db-helper';
import { prismaTestClient } from '../helpers/db';
import type { PrismaClient } from '@prisma/client';

const describeFn = DB_AVAILABLE ? describe : describe.skip;

describeFn('rotateTenantDek stub', () => {
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

    it('throws with the runbook-carrying error message', async () => {
        await expect(rotateTenantDek('tenant-1')).rejects.toThrow(
            /DATA_ENCRYPTION_KEY_PREVIOUS/,
        );
        await expect(rotateTenantDek('tenant-1')).rejects.toThrow(
            /not implemented/,
        );
    });

    it('Tenant.previousEncryptedDek is queryable — proves schema + migration both landed', async () => {
        // Pure schema-presence check: the field must be selectable
        // through the Prisma client. If the schema edit shipped but
        // the migration didn't, this query fails at runtime with a
        // Postgres "column does not exist" error.
        const row = await prisma.tenant.findFirst({
            select: { id: true, previousEncryptedDek: true },
        });
        // If there are no tenants in the test DB, findFirst returns null —
        // the assertion is about the SHAPE of the response, not the
        // count. TypeScript's type narrowing confirms the field exists.
        expect(
            row === null ||
            typeof row.previousEncryptedDek === 'string' ||
            row.previousEncryptedDek === null,
        ).toBe(true);
    });

    it('CHECK constraint rejects identical DEK values — silent-key-mixing guard', async () => {
        // Create a tenant we can safely mutate, then try to set
        // previousEncryptedDek to the same value as encryptedDek.
        // Postgres should reject with the constraint name.
        const slug = `f2-constraint-${Date.now()}`;
        slugs.push(slug);
        const t = await prisma.tenant.create({
            data: {
                name: 'f2-constraint-test',
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
