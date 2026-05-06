/**
 * Epic G-2 integration — ControlTestPlan scheduling fields roundtrip.
 *
 * Backs the schema foundation with behavioural assertions:
 *
 *   1. A plan created WITHOUT any of the new G-2 fields gets the
 *      pre-G-2-equivalent shape — `automationType=MANUAL`, every
 *      schedule field null. This is the backward-compat invariant:
 *      existing manual plans + the existing TestPlanRepository.create
 *      call site (which doesn't yet pass G-2 fields) must keep
 *      working unchanged.
 *
 *   2. A plan created WITH the full G-2 surface (SCRIPT type, cron
 *      schedule, IANA TZ, nextRunAt, lastScheduledRunAt,
 *      automationConfig blob) roundtrips through the Prisma client
 *      with no truncation or coercion.
 *
 *   3. The two new indexes are queryable in their canonical shapes:
 *      `WHERE tenantId=? AND nextRunAt <= now()` (scheduler scan)
 *      and `WHERE tenantId=? AND automationType=? AND status=?`
 *      (worker filter). This doesn't EXPLAIN the plan — just confirms
 *      the queries execute and return the right rows after migration.
 *
 *   4. The AutomationType enum rejects unknown values at the DB layer
 *      (Postgres raises an enum cast error). This protects against a
 *      future PR widening the enum-shaped JSON config blob without
 *      also widening the enum.
 *
 * RUN: npx jest tests/integration/control-test-plan-scheduling.test.ts
 */
import { randomUUID } from 'crypto';
import { DB_AVAILABLE } from './db-helper';
import { prismaTestClient } from '../helpers/db';

// GAP-21: route writes through the PII-encryption-enabled client
// (`emailHash` on User is NOT NULL at the DB but populated by the
// middleware). A bare `new PrismaClient` here would skip the
// middleware and trip `Null constraint violation`.
const prisma = prismaTestClient();

const describeFn = DB_AVAILABLE ? describe : describe.skip;

describeFn('Epic G-2 — ControlTestPlan scheduling roundtrip', () => {
    const runId = randomUUID();
    let tenantId: string;
    let userId: string;
    let controlId: string;
    const createdPlanIds: string[] = [];

    beforeAll(async () => {
        const user = await prisma.user.create({
            data: { email: `g2-${runId}@test.com`, name: 'G-2 Test User' },
        });
        userId = user.id;

        const tenant = await prisma.tenant.create({
            data: {
                name: `G-2 Tenant ${runId}`,
                slug: `g2-${runId}`,
                industry: 'Tech',
                maxRiskScale: 5,
            },
        });
        tenantId = tenant.id;

        const control = await prisma.control.create({
            data: {
                tenantId,
                name: `G-2 Control ${runId}`,
                createdByUserId: userId,
            },
        });
        controlId = control.id;
    });

    afterAll(async () => {
        if (tenantId) {
            try {
                await prisma.$executeRawUnsafe(
                    `DELETE FROM "ControlTestPlan" WHERE "tenantId" = $1`,
                    tenantId,
                );
                await prisma.$executeRawUnsafe(
                    `DELETE FROM "Control" WHERE "tenantId" = $1`,
                    tenantId,
                );
                await prisma.$executeRawUnsafe(
                    `DELETE FROM "Tenant" WHERE "id" = $1`,
                    tenantId,
                );
                await prisma.$executeRawUnsafe(
                    `DELETE FROM "User" WHERE "id" = $1`,
                    userId,
                );
            } catch (e) {
                console.warn('[g2-scheduling] cleanup error:', e);
            }
        }
        await prisma.$disconnect();
    });

    test('plan created without G-2 fields gets pre-G-2-equivalent shape', async () => {
        // Mirrors the existing TestPlanRepository.create call site —
        // no scheduling fields passed. After migration these must come
        // back as MANUAL + nulls so existing callers stay observationally
        // identical.
        const plan = await prisma.controlTestPlan.create({
            data: {
                tenantId,
                controlId,
                name: `Manual plan ${runId}`,
                createdByUserId: userId,
            },
        });
        createdPlanIds.push(plan.id);

        expect(plan.automationType).toBe('MANUAL');
        expect(plan.schedule).toBeNull();
        expect(plan.scheduleTimezone).toBeNull();
        expect(plan.nextRunAt).toBeNull();
        expect(plan.lastScheduledRunAt).toBeNull();
        expect(plan.automationConfig).toBeNull();
    });

    test('plan with full G-2 surface roundtrips correctly', async () => {
        const cron = '0 9 * * MON';
        const nextRun = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const lastRun = new Date(Date.now() - 60 * 60 * 1000);
        const config = {
            scriptId: 'aws.iam.password-policy',
            params: { minLength: 14 },
        };

        const plan = await prisma.controlTestPlan.create({
            data: {
                tenantId,
                controlId,
                name: `SCRIPT plan ${runId}`,
                createdByUserId: userId,
                automationType: 'SCRIPT',
                schedule: cron,
                scheduleTimezone: 'Europe/London',
                nextRunAt: nextRun,
                lastScheduledRunAt: lastRun,
                automationConfig: config,
            },
        });
        createdPlanIds.push(plan.id);

        expect(plan.automationType).toBe('SCRIPT');
        expect(plan.schedule).toBe(cron);
        expect(plan.scheduleTimezone).toBe('Europe/London');
        // Postgres truncates to ms; assert by ISO string for stability.
        expect(plan.nextRunAt?.toISOString()).toBe(nextRun.toISOString());
        expect(plan.lastScheduledRunAt?.toISOString()).toBe(
            lastRun.toISOString(),
        );
        expect(plan.automationConfig).toEqual(config);
    });

    test('scheduler scan query returns due plans (tenantId, nextRunAt <= now)', async () => {
        const past = new Date(Date.now() - 5 * 60 * 1000);
        const future = new Date(Date.now() + 60 * 60 * 1000);

        const dueP = await prisma.controlTestPlan.create({
            data: {
                tenantId,
                controlId,
                name: `Due plan ${runId}`,
                createdByUserId: userId,
                automationType: 'SCRIPT',
                schedule: '*/5 * * * *',
                nextRunAt: past,
            },
        });
        createdPlanIds.push(dueP.id);

        const futureP = await prisma.controlTestPlan.create({
            data: {
                tenantId,
                controlId,
                name: `Future plan ${runId}`,
                createdByUserId: userId,
                automationType: 'SCRIPT',
                schedule: '*/5 * * * *',
                nextRunAt: future,
            },
        });
        createdPlanIds.push(futureP.id);

        const due = await prisma.controlTestPlan.findMany({
            where: {
                tenantId,
                nextRunAt: { lte: new Date() },
            },
            select: { id: true },
        });
        const dueIds = due.map((p: { id: string }) => p.id);
        expect(dueIds).toContain(dueP.id);
        expect(dueIds).not.toContain(futureP.id);
    });

    test('worker filter query supports (tenantId, automationType, status)', async () => {
        const integ = await prisma.controlTestPlan.create({
            data: {
                tenantId,
                controlId,
                name: `INTEGRATION plan ${runId}`,
                createdByUserId: userId,
                automationType: 'INTEGRATION',
                status: 'ACTIVE',
            },
        });
        createdPlanIds.push(integ.id);

        const matched = await prisma.controlTestPlan.findMany({
            where: {
                tenantId,
                automationType: 'INTEGRATION',
                status: 'ACTIVE',
            },
            select: { id: true },
        });
        expect(matched.map((p: { id: string }) => p.id)).toContain(integ.id);
    });

    test('AutomationType enum rejects unknown values at the DB layer', async () => {
        await expect(
            prisma.$executeRawUnsafe(
                // Direct SQL — Prisma client would reject the bad value
                // at the type level. Going under the client confirms
                // the DB enum constraint is real.
                `INSERT INTO "ControlTestPlan" (
                    id, "tenantId", "controlId", name, "createdByUserId",
                    "automationType", "createdAt", "updatedAt", method,
                    frequency, status
                ) VALUES (
                    $1, $2, $3, $4, $5, 'GREMLIN', now(), now(),
                    'MANUAL', 'AD_HOC', 'ACTIVE'
                )`,
                `bad-${runId}`,
                tenantId,
                controlId,
                `Bad enum plan ${runId}`,
                userId,
            ),
        ).rejects.toThrow();
    });
});
