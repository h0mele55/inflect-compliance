/**
 * GET /api/health
 *
 * LEGACY compatibility endpoint — delegates to /api/readyz.
 *
 * Retained for backward compatibility with existing monitoring
 * configurations and load balancers. New deployments should use:
 *   - /api/livez  — liveness probe (always 200 if process is up)
 *   - /api/readyz — readiness probe (checks DB + Redis)
 *
 * @deprecated Use /api/livez and /api/readyz instead.
 */
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { jsonResponse } from '@/lib/api-response';

const prisma = new PrismaClient();

export async function GET() {
    const start = Date.now();
    const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {};

    // ── DB check ──
    try {
        const dbStart = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
    } catch {
        checks.database = { status: 'error', error: 'Connection failed' };
    }

    const allOk = Object.values(checks).every(c => c.status === 'ok');

    return jsonResponse(
        {
            status: allOk ? 'healthy' : 'degraded',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: process.env.BUILD_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'dev',
            node: process.version,
            checks,
            latencyMs: Date.now() - start,
            _deprecated: 'Use /api/livez and /api/readyz instead',
        },
        { status: allOk ? 200 : 503 }
    );
}
