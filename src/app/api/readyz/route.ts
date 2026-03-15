/**
 * GET /api/readyz
 *
 * Kubernetes/Docker readiness probe.
 * Returns 200 only when DB is connected and migrations are applied.
 */
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
    try {
        // Verify DB is reachable and has at least one migration applied
        await prisma.$queryRaw`SELECT 1`;
        const migrationCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
            SELECT COUNT(*)::bigint as count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL
        `;
        const count = Number(migrationCount[0]?.count ?? 0);

        if (count === 0) {
            return NextResponse.json(
                { ready: false, reason: 'No migrations applied' },
                { status: 503 }
            );
        }

        return NextResponse.json({ ready: true, migrations: count }, { status: 200 });
    } catch {
        return NextResponse.json(
            { ready: false, reason: 'Database unreachable' },
            { status: 503 }
        );
    }
}
