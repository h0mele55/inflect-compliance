/**
 * Connection Pooling Integration Test
 *
 * Validates that the database connection can handle high concurrency
 * by running 60+ parallel queries simultaneously. When PgBouncer is
 * configured correctly, this should complete without connection exhaustion.
 *
 * This test uses the actual Prisma client and DATABASE_URL.
 * In CI, DATABASE_URL should point to PgBouncer.
 */
import { PrismaClient } from '@prisma/client';

const CONCURRENCY_LEVEL = 60;

describe('Connection pooling: concurrent query handling', () => {
    let prisma: PrismaClient;

    beforeAll(() => {
        prisma = new PrismaClient({
            // Override Prisma's connection pool to allow high concurrency
            datasources: {
                db: {
                    url: process.env.DATABASE_URL!,
                },
            },
        });
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    test(`handles ${CONCURRENCY_LEVEL} concurrent queries without connection exhaustion`, async () => {
        // Fire N queries simultaneously — each one is a lightweight SELECT 1
        const queries = Array.from({ length: CONCURRENCY_LEVEL }, (_, i) =>
            prisma.$queryRawUnsafe<[{ result: number }]>(`SELECT ${i + 1} as result`)
                .then((rows) => ({
                    index: i,
                    result: Number(rows[0]?.result),
                    ok: true,
                }))
                .catch((err) => ({
                    index: i,
                    result: -1,
                    ok: false,
                    error: (err as Error).message,
                })),
        );

        const results = await Promise.all(queries);

        const successes = results.filter((r) => r.ok);
        const failures = results.filter((r) => !r.ok);

        // Log failures for debugging
        if (failures.length > 0) {
            console.error(
                `${failures.length} queries failed:`,
                failures.slice(0, 5).map((f) => (f as { error: string }).error),
            );
        }

        // All queries should succeed
        expect(successes.length).toBe(CONCURRENCY_LEVEL);
        expect(failures.length).toBe(0);

        // Each query should return its expected value
        for (const result of successes) {
            expect(result.result).toBe(result.index + 1);
        }
    }, 30000); // 30s timeout for slower CI environments

    test('sequential queries work after concurrent burst', async () => {
        // Verify the pool recovers after high-concurrency burst
        const result = await prisma.$queryRawUnsafe<[{ one: number }]>('SELECT 1 as one');
        expect(Number(result[0]?.one)).toBe(1);
    });
});
