import { PrismaClient } from '@prisma/client';
import { withTenantDb } from '@/lib/db-context';
import { randomUUID } from 'crypto';
import { DB_URL, DB_AVAILABLE } from './db-helper';

const globalPrisma = new PrismaClient({
    datasources: {
        db: {
            url: DB_URL,
        },
    },
});

// Skip entire suite when DB is not reachable
const describeFn = DB_AVAILABLE ? describe : describe.skip;

describeFn('Postgres RLS Tenant Isolation', () => {
    const testRunId = randomUUID();
    let tenantAId: string;
    let tenantBId: string;
    let userAId: string;

    beforeAll(async () => {
        // Create a test user (User table has no RLS — global)
        const userA = await globalPrisma.user.create({
            data: { email: `rls-test-${testRunId}@test.com`, name: 'RLS Test User' },
        });
        userAId = userA.id;

        // Create Tenant A and its Risk/Policy/Evidence using global connection
        const tenantA = await globalPrisma.tenant.create({
            data: { name: 'Tenant A', slug: `tenant-a-${testRunId}`, industry: 'Technology', maxRiskScale: 5 },
        });
        tenantAId = tenantA.id;

        await globalPrisma.risk.create({
            data: {
                tenantId: tenantAId,
                title: `Risk A - ${testRunId}`,
                inherentScore: 10,
                score: 10,
            },
        });

        await globalPrisma.policy.create({
            data: {
                tenantId: tenantAId,
                title: `Policy A - ${testRunId}`,
                slug: `policy-a-${testRunId}`,
            },
        });

        await globalPrisma.evidence.create({
            data: {
                tenantId: tenantAId,
                title: `Evidence A - ${testRunId}`,
                type: 'TEXT',
                content: 'Test evidence content A',
            },
        });

        // Create Tenant B
        const tenantB = await globalPrisma.tenant.create({
            data: { name: 'Tenant B', slug: `tenant-b-${testRunId}`, industry: 'Technology', maxRiskScale: 5 },
        });
        tenantBId = tenantB.id;

        await globalPrisma.risk.create({
            data: {
                tenantId: tenantBId,
                title: `Risk B - ${testRunId}`,
                inherentScore: 10,
                score: 10,
            },
        });

        await globalPrisma.policy.create({
            data: {
                tenantId: tenantBId,
                title: `Policy B - ${testRunId}`,
                slug: `policy-b-${testRunId}`,
            },
        });

        await globalPrisma.evidence.create({
            data: {
                tenantId: tenantBId,
                title: `Evidence B - ${testRunId}`,
                type: 'TEXT',
                content: 'Test evidence content B',
            },
        });
    });

    afterAll(async () => {
        const tenantIds = [tenantAId, tenantBId].filter(Boolean);
        try {
            for (const tid of tenantIds) {
                await globalPrisma.$executeRawUnsafe(`DELETE FROM "Evidence" WHERE "tenantId" = $1`, tid);
                await globalPrisma.$executeRawUnsafe(`DELETE FROM "Policy" WHERE "tenantId" = $1`, tid);
                await globalPrisma.$executeRawUnsafe(`DELETE FROM "Risk" WHERE "tenantId" = $1`, tid);
                await globalPrisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE "id" = $1`, tid);
            }
            if (userAId) await globalPrisma.$executeRawUnsafe(`DELETE FROM "User" WHERE "id" = $1`, userAId);
        } catch (e) {
            console.warn('[rls-isolation] cleanup error:', e);
        }
        await globalPrisma.$disconnect();
    });

    // ─── Risk Table ───

    describe('Risk SELECT Isolation', () => {
        it('Tenant A context cannot see Tenant B risks even without WHERE filter', async () => {
            await withTenantDb(tenantAId, async (tx) => {
                const risks = await tx.risk.findMany({
                    where: { title: { contains: testRunId } }
                });

                expect(risks.length).toBeGreaterThan(0);
                for (const risk of risks) {
                    expect(risk.tenantId).toBe(tenantAId);
                }
            }, globalPrisma);
        });
    });

    describe('Risk INSERT Isolation', () => {
        it('Cannot insert a risk belonging to Tenant B while in Tenant A context', async () => {
            await expect(
                withTenantDb(tenantAId, async (tx) => {
                    await tx.risk.create({
                        data: {
                            tenantId: tenantBId,
                            title: 'Malicious Risk Insert',
                            inherentScore: 5,
                            score: 5,
                        },
                    });
                }, globalPrisma)
            ).rejects.toThrow(/new row violates row-level security policy/);
        });
    });

    describe('Risk DELETE Isolation', () => {
        it('Cannot delete Tenant B risks from Tenant A context', async () => {
            await withTenantDb(tenantAId, async (tx) => {
                const result = await tx.risk.deleteMany({
                    where: { title: { contains: testRunId } }
                });
                expect(result.count).toBeGreaterThan(0);
            }, globalPrisma);

            // Verify Tenant B's risk survives
            const bRisks = await globalPrisma.risk.findMany({
                where: { tenantId: tenantBId, title: { contains: testRunId } }
            });
            expect(bRisks.length).toBe(1);
        });
    });

    // ─── Policy Table ───

    describe('Policy SELECT Isolation', () => {
        it('Tenant A context only sees its own policies', async () => {
            await withTenantDb(tenantAId, async (tx) => {
                const policies = await tx.policy.findMany({
                    where: { title: { contains: testRunId } }
                });

                expect(policies.length).toBe(1);
                expect(policies[0].title).toBe(`Policy A - ${testRunId}`);
                expect(policies[0].tenantId).toBe(tenantAId);
            }, globalPrisma);
        });
    });

    describe('Policy INSERT Isolation', () => {
        it('Cannot insert a policy under Tenant B while in Tenant A context', async () => {
            await expect(
                withTenantDb(tenantAId, async (tx) => {
                    await tx.policy.create({
                        data: {
                            tenantId: tenantBId,
                            title: 'Malicious Policy Insert',
                            slug: `malicious-${Date.now()}`,
                        },
                    });
                }, globalPrisma)
            ).rejects.toThrow(/new row violates row-level security policy/);
        });
    });

    // ─── Evidence Table ───

    describe('Evidence SELECT Isolation', () => {
        it('Tenant B context only sees its own evidence', async () => {
            await withTenantDb(tenantBId, async (tx) => {
                const evidence = await tx.evidence.findMany({
                    where: { title: { contains: testRunId } }
                });

                expect(evidence.length).toBe(1);
                expect(evidence[0].title).toBe(`Evidence B - ${testRunId}`);
                expect(evidence[0].tenantId).toBe(tenantBId);
            }, globalPrisma);
        });
    });

    // ─── Control Table (nullable tenantId) ───

    describe('Control with nullable tenantId', () => {
        let globalControlId: string;
        let tenantAControlId: string;

        beforeAll(async () => {
            // Create a global control (tenantId = null)
            const globalCtrl = await globalPrisma.control.create({
                data: { name: `Global Control - ${testRunId}`, status: 'IMPLEMENTED' },
            });
            globalControlId = globalCtrl.id;

            // Create a tenant-specific control for Tenant A
            const tenantCtrl = await globalPrisma.control.create({
                data: { tenantId: tenantAId, name: `TenantA Control - ${testRunId}`, status: 'PLANNED' },
            });
            tenantAControlId = tenantCtrl.id;
        });

        afterAll(async () => {
            for (const ctrlId of [globalControlId, tenantAControlId].filter(Boolean)) {
                await globalPrisma.$executeRawUnsafe(`DELETE FROM "Control" WHERE "id" = $1`, ctrlId);
            }
        });

        it('Tenant A can see both global (null tenantId) and its own controls', async () => {
            await withTenantDb(tenantAId, async (tx) => {
                const controls = await tx.control.findMany({
                    where: { name: { contains: testRunId } },
                });

                const names = controls.map(c => c.name);
                expect(names).toContain(`Global Control - ${testRunId}`);
                expect(names).toContain(`TenantA Control - ${testRunId}`);
            }, globalPrisma);
        });

        it('Tenant B can see global controls but NOT Tenant A-specific controls', async () => {
            await withTenantDb(tenantBId, async (tx) => {
                const controls = await tx.control.findMany({
                    where: { name: { contains: testRunId } },
                });

                const names = controls.map(c => c.name);
                expect(names).toContain(`Global Control - ${testRunId}`);
                expect(names).not.toContain(`TenantA Control - ${testRunId}`);
            }, globalPrisma);
        });
    });

    // ─── No Context Edge Case ───

    describe('No tenant context set', () => {
        it('Querying without app.tenant_id returns zero rows from tenant-scoped tables', async () => {
            // Execute a raw transaction as app_user but WITHOUT setting app.tenant_id
            const result = await globalPrisma.$transaction(async (tx) => {
                await tx.$executeRaw`SET LOCAL ROLE app_user`;
                // DO NOT set app.tenant_id — should return empty
                return tx.risk.findMany({
                    where: { title: { contains: testRunId } },
                });
            });

            expect(result.length).toBe(0);
        });
    });
});
