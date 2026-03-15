/**
 * GET /api/health
 *
 * Liveness + readiness probe. Checks DB connectivity.
 * Returns build info when available.
 *
 * No auth required — this is a public health check.
 */
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
    const start = Date.now();
    const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {};

    // ── DB check ──
    try {
        const dbStart = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
    } catch (err) {
        checks.database = { status: 'error', error: 'Connection failed' };
    }

    const allOk = Object.values(checks).every(c => c.status === 'ok');

    return NextResponse.json(
        {
            status: allOk ? 'healthy' : 'degraded',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: process.env.BUILD_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'dev',
            node: process.version,
            checks,
            latencyMs: Date.now() - start,
        },
        { status: allOk ? 200 : 503 }
    );
}
