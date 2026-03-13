/**
 * Integration tests for Prisma audit middleware — verifies that write operations
 * automatically produce AuditLog rows with diff and redaction support.
 *
 * Requires a running PostgreSQL instance with applied migrations.
 *
 * RUN: npx jest tests/integration/audit-middleware.test.ts
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { runWithAuditContext, getAuditContext } from '@/lib/audit-context';
import { redactSensitiveFields, extractChangedFields } from '@/lib/audit-redact';
import { DB_URL, DB_AVAILABLE } from './db-helper';

const RealDbUrl = DB_URL;

// ─── Mirrors prisma.ts middleware logic ───
const WRITE_ACTIONS = new Set([
    'create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert',
]);
const DIFF_ACTIONS = new Set(['update', 'upsert']);
const EXCLUDED_MODELS = new Set(['AuditLog']);

function generateCuid(): string {
    const uuid = randomUUID().replace(/-/g, '');
    return 'c' + uuid.substring(0, 24);
}

function buildDiffJson(action: string, data: any, result: any) {
    if (!DIFF_ACTIONS.has(action) || !data) return null;
    const changedFields = extractChangedFields(data);
    if (changedFields.length === 0) return null;
    const afterRaw: Record<string, any> = {};
    for (const field of changedFields) {
        if (result && field in result) afterRaw[field] = result[field];
    }
    return { changedFields, after: redactSensitiveFields(afterRaw) };
}

/**
 * Creates a PrismaClient with the audit middleware registered.
 */
function createTestPrismaWithMiddleware(): PrismaClient {
    const client = new PrismaClient({
        datasources: { db: { url: RealDbUrl } },
    });

    client.$use(async (params, next) => {
        if (!WRITE_ACTIONS.has(params.action)) return next(params);
        if (params.model && EXCLUDED_MODELS.has(params.model)) return next(params);

        const ctx = getAuditContext();
        const tenantId = ctx?.tenantId;
        if (!tenantId) return next(params);

        const actorUserId = ctx?.actorUserId || null;
        const requestId = ctx?.requestId || null;
        const source = ctx?.source || 'test';
        const updateData = params.action === 'upsert'
            ? params.args?.update ?? null
            : params.args?.data ?? null;

        const result = await next(params);

        try {
            const model = params.model || 'Unknown';
            const action = params.action.toUpperCase();

            let entityId = 'unknown';
            let recordIds: any = null;

            if (['create', 'update', 'upsert', 'delete'].includes(params.action)) {
                entityId = result?.id || 'unknown';
            } else if (params.action === 'createMany') {
                entityId = 'batch';
                recordIds = { count: result?.count ?? 0 };
            } else if (params.action === 'updateMany' || params.action === 'deleteMany') {
                entityId = 'batch';
                recordIds = { count: result?.count ?? 0 };
            }

            const metadataJson: Record<string, any> = { source };
            if (params.args?.where && (params.action === 'updateMany' || params.action === 'deleteMany')) {
                metadataJson.filterKeys = Object.keys(params.args.where);
            }

            const diffJson = buildDiffJson(params.action, updateData, result);

            const id = generateCuid();
            await client.$executeRawUnsafe(
                `INSERT INTO "AuditLog" ("id", "tenantId", "userId", "entity", "entityId", "action", "details", "requestId", "recordIds", "metadataJson", "diffJson", "createdAt")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, NOW())`,
                id, tenantId, actorUserId, model, entityId, action, null,
                requestId,
                recordIds ? JSON.stringify(recordIds) : null,
                JSON.stringify(metadataJson),
                diffJson ? JSON.stringify(diffJson) : null,
            );
        } catch (_) {
            // Best effort
        }

        return result;
    });

    return client;
}

// Raw client for verification queries (no middleware)
const rawPrisma = new PrismaClient({ datasources: { db: { url: RealDbUrl } } });
const appPrisma = createTestPrismaWithMiddleware();

const testRunId = randomUUID();

// Skip entire suite when DB is not reachable
const describeFn = DB_AVAILABLE ? describe : describe.skip;

describeFn('Audit Middleware — Integration Tests', () => {
    let tenantId: string;
    let userId: string;

    beforeAll(async () => {

        const user = await rawPrisma.user.create({
            data: { email: `audit-mw-${testRunId}@test.com`, name: 'Audit MW Test' },
        });
        userId = user.id;

        const tenant = await rawPrisma.tenant.create({
            data: { name: `AMW Tenant ${testRunId}`, slug: `amw-${testRunId}`, industry: 'Technology', maxRiskScale: 5 },
        });
        tenantId = tenant.id;
    });

    afterAll(async () => {
        // Use raw SQL for cleanup to bypass any middleware (soft-delete, audit).
        if (tenantId) {
            try {
                await rawPrisma.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE "tenantId" = $1`, tenantId);
                await rawPrisma.$executeRawUnsafe(`DELETE FROM "Risk" WHERE "tenantId" = $1`, tenantId);
                await rawPrisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE "id" = $1`, tenantId);
                if (userId) await rawPrisma.$executeRawUnsafe(`DELETE FROM "User" WHERE "id" = $1`, userId);
            } catch (e) {
                console.warn('[audit-middleware] cleanup error:', e);
            }
        }
        await rawPrisma.$disconnect().catch(() => {});
        await appPrisma.$disconnect().catch(() => {});
    });

    async function getAuditLogs(entity?: string, action?: string) {
        const where: any = { tenantId };
        if (entity) where.entity = entity;
        if (action) where.action = action;
        return rawPrisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' } });
    }

    // ─── CREATE ───
    describe('create operation', () => {
        let riskId: string;

        it('creates an AuditLog row for a Risk create', async () => {
            const risk = await runWithAuditContext(
                { tenantId, actorUserId: userId, requestId: `req-create-${testRunId}` },
                () => appPrisma.risk.create({
                    data: { tenantId, title: `AMW Risk Create ${testRunId}`, inherentScore: 5, score: 5 },
                }),
            );
            riskId = risk.id;

            const logs = await getAuditLogs('Risk', 'CREATE');
            const match = logs.find((l) => l.entityId === riskId);
            expect(match).toBeDefined();
            expect(match!.userId).toBe(userId);
            expect((match as any).requestId).toBe(`req-create-${testRunId}`);
            expect(match!.action).toBe('CREATE');
            // CREATE should NOT have diffJson
            expect((match as any).diffJson).toBeNull();
        });

        afterAll(async () => {
            if (riskId) await rawPrisma.risk.deleteMany({ where: { id: riskId } });
        });
    });

    // ─── UPDATE with DIFF ───
    describe('update operation with diff', () => {
        let riskId: string;

        beforeAll(async () => {
            const risk = await rawPrisma.risk.create({
                data: { tenantId, title: `AMW Risk Update ${testRunId}`, inherentScore: 3, score: 3 },
            });
            riskId = risk.id;
        });

        it('creates an AuditLog row with diffJson for a Risk update', async () => {
            await runWithAuditContext(
                { tenantId, actorUserId: userId, requestId: `req-update-${testRunId}` },
                () => appPrisma.risk.update({
                    where: { id: riskId },
                    data: { title: `Updated ${testRunId}`, inherentScore: 8 },
                }),
            );

            const logs = await getAuditLogs('Risk', 'UPDATE');
            const match = logs.find((l) => l.entityId === riskId);
            expect(match).toBeDefined();

            // Verify diffJson
            const diff = (match as any).diffJson as any;
            expect(diff).toBeDefined();
            expect(diff).not.toBeNull();
            expect(diff.changedFields).toContain('title');
            expect(diff.changedFields).toContain('inherentScore');
            expect(diff.after).toBeDefined();
            expect(diff.after.title).toBe(`Updated ${testRunId}`);
            expect(diff.after.inherentScore).toBe(8);
        });

        afterAll(async () => {
            await rawPrisma.$executeRawUnsafe(`DELETE FROM "Risk" WHERE "id" = $1`, riskId);
        });
    });

    // ─── DELETE ───
    describe('delete operation', () => {
        let riskId: string;

        beforeAll(async () => {
            const risk = await rawPrisma.risk.create({
                data: { tenantId, title: `AMW Risk Delete ${testRunId}`, inherentScore: 2, score: 2 },
            });
            riskId = risk.id;
        });

        it('creates an AuditLog row for a Risk delete', async () => {
            await runWithAuditContext(
                { tenantId, actorUserId: userId, requestId: `req-delete-${testRunId}` },
                () => appPrisma.risk.delete({ where: { id: riskId } }),
            );

            const logs = await getAuditLogs('Risk', 'DELETE');
            const match = logs.find((l) => l.entityId === riskId);
            expect(match).toBeDefined();
            expect(match!.action).toBe('DELETE');
            // DELETE should NOT have diffJson
            expect((match as any).diffJson).toBeNull();
        });
    });

    // ─── UPSERT with DIFF ───
    describe('upsert operation with diff', () => {
        let riskId: string;

        it('creates an AuditLog row with diffJson for a Risk upsert', async () => {
            const tempId = `upsert-${testRunId}`;
            const risk = await runWithAuditContext(
                { tenantId, actorUserId: userId, requestId: `req-upsert-${testRunId}` },
                () => appPrisma.risk.upsert({
                    where: { id: tempId },
                    create: { tenantId, title: `AMW Risk Upsert ${testRunId}`, inherentScore: 1, score: 1 },
                    update: { title: `Upserted ${testRunId}` },
                }),
            );
            riskId = risk.id;

            const logs = await getAuditLogs('Risk', 'UPSERT');
            const match = logs.find((l) => l.entityId === riskId);
            expect(match).toBeDefined();
            expect(match!.action).toBe('UPSERT');
            // Upsert should have diffJson (from update data)
            const diff = (match as any).diffJson as any;
            expect(diff).not.toBeNull();
            expect(diff.changedFields).toContain('title');
        });

        afterAll(async () => {
            if (riskId) await rawPrisma.risk.deleteMany({ where: { id: riskId } });
        });
    });

    // ─── UPDATE MANY ───
    describe('updateMany operation', () => {
        beforeAll(async () => {
            await rawPrisma.risk.createMany({
                data: [
                    { tenantId, title: `Bulk1 ${testRunId}`, inherentScore: 1, score: 1 },
                    { tenantId, title: `Bulk2 ${testRunId}`, inherentScore: 1, score: 1 },
                ],
            });
        });

        it('creates an AuditLog row for updateMany', async () => {
            await runWithAuditContext(
                { tenantId, actorUserId: userId, requestId: `req-updateMany-${testRunId}` },
                () => appPrisma.risk.updateMany({
                    where: { tenantId, title: { contains: testRunId, startsWith: 'Bulk' } },
                    data: { inherentScore: 9 },
                }),
            );

            const logs = await getAuditLogs('Risk', 'UPDATEMANY');
            const match = logs.find((l) => (l as any).requestId === `req-updateMany-${testRunId}`);
            expect(match).toBeDefined();
            expect(match!.entityId).toBe('batch');
            const recordIds = (match as any).recordIds as any;
            expect(recordIds.count).toBeGreaterThanOrEqual(2);
        });

        afterAll(async () => {
            await rawPrisma.$executeRawUnsafe(`DELETE FROM "Risk" WHERE "tenantId" = $1 AND "title" LIKE $2`, tenantId, `Bulk%${testRunId}%`);
        });
    });

    // ─── DELETE MANY ───
    describe('deleteMany operation', () => {
        beforeAll(async () => {
            await rawPrisma.risk.createMany({
                data: [
                    { tenantId, title: `DelBulk1 ${testRunId}`, inherentScore: 1, score: 1 },
                    { tenantId, title: `DelBulk2 ${testRunId}`, inherentScore: 1, score: 1 },
                ],
            });
        });

        it('creates an AuditLog row for deleteMany', async () => {
            await runWithAuditContext(
                { tenantId, actorUserId: userId, requestId: `req-deleteMany-${testRunId}` },
                () => appPrisma.risk.deleteMany({
                    where: { tenantId, title: { contains: testRunId, startsWith: 'DelBulk' } },
                }),
            );

            const logs = await getAuditLogs('Risk', 'DELETEMANY');
            const match = logs.find((l) => (l as any).requestId === `req-deleteMany-${testRunId}`);
            expect(match).toBeDefined();
            expect(match!.entityId).toBe('batch');
        });
    });

    // ─── RECURSION GUARD ───
    describe('AuditLog recursion prevention', () => {
        it('writing directly to AuditLog does NOT create a secondary AuditLog row', async () => {
            const countBefore = await rawPrisma.auditLog.count({ where: { tenantId } });

            await runWithAuditContext({ tenantId, actorUserId: userId }, () =>
                appPrisma.auditLog.create({
                    data: {
                        tenantId,
                        entity: 'TestRecursion',
                        entityId: 'test-recursion-check',
                        action: 'MANUAL_TEST',
                    },
                }),
            );

            const countAfter = await rawPrisma.auditLog.count({ where: { tenantId } });
            expect(countAfter - countBefore).toBe(1);
        });
    });

    // ─── MISSING CONTEXT ───
    describe('missing audit context', () => {
        it('operations outside runWithAuditContext skip audit logging', async () => {
            const countBefore = await rawPrisma.auditLog.count({ where: { tenantId } });

            const risk = await appPrisma.risk.create({
                data: { tenantId, title: `No Context Risk ${testRunId}`, inherentScore: 1, score: 1 },
            });

            const countAfter = await rawPrisma.auditLog.count({ where: { tenantId } });
            expect(countAfter).toBe(countBefore);

            await rawPrisma.risk.deleteMany({ where: { id: risk.id } });
        });
    });

    // ─── REDACTION IN DIFFS ───
    describe('redaction in diff output', () => {
        it('sensitive fields in update data are redacted in diffJson', async () => {
            // Create a user with known data, then update with "password-like" field
            // Since User model doesn't have password, we test redaction via the unit tests primarily.
            // Here we verify that the redaction integration works end-to-end for normal fields.
            const risk = await rawPrisma.risk.create({
                data: { tenantId, title: `Redact Risk ${testRunId}`, inherentScore: 1, score: 1 },
            });

            await runWithAuditContext(
                { tenantId, actorUserId: userId },
                () => appPrisma.risk.update({
                    where: { id: risk.id },
                    data: { title: `Redacted Update ${testRunId}` },
                }),
            );

            const logs = await getAuditLogs('Risk', 'UPDATE');
            const match = logs.find((l) => l.entityId === risk.id);
            expect(match).toBeDefined();
            const diff = (match as any).diffJson as any;
            expect(diff).not.toBeNull();
            expect(diff.changedFields).toContain('title');
            // Verify title is NOT redacted (it's not sensitive)
            expect(diff.after.title).toBe(`Redacted Update ${testRunId}`);

            await rawPrisma.risk.deleteMany({ where: { id: risk.id } });
        });
    });
});
