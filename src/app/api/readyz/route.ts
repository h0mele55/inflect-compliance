/**
 * GET /api/readyz
 *
 * Kubernetes-compatible readiness probe.
 *
 * Returns 200 only when ALL critical dependencies are reachable.
 * Returns 503 with structured JSON when any dependency is unavailable.
 * The orchestrator should stop routing traffic to this instance when 503.
 *
 * Checked dependencies:
 *   - PostgreSQL (via Prisma $queryRaw)
 *   - Redis (optional — only checked when REDIS_URL is configured)
 *
 * Contract:
 *   200 — ready to serve traffic
 *   503 — not ready (dependency unavailable)
 *
 * This endpoint NEVER throws — all errors are caught and reported
 * as structured check failures in the JSON response.
 */
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { jsonResponse } from '@/lib/api-response';

// Reuse a module-level client to avoid connection pool churn on every probe.
const prisma = new PrismaClient();

// Redis is optional — import dynamically to avoid hard dependency.
let getRedis: (() => import('ioredis').default | null) | undefined;
let isRedisConfigured = false;

try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const redisModule = require('@/lib/redis');
    getRedis = redisModule.getRedis;
    isRedisConfigured = !!process.env.REDIS_URL;
} catch {
    // Redis module not available — skip Redis checks
}

interface CheckResult {
    status: 'ok' | 'error';
    latencyMs?: number;
    error?: string;
}

async function checkDatabase(): Promise<CheckResult> {
    const start = Date.now();
    try {
        await prisma.$queryRaw`SELECT 1`;
        return { status: 'ok', latencyMs: Date.now() - start };
    } catch {
        return { status: 'error', latencyMs: Date.now() - start, error: 'Connection failed' };
    }
}

async function checkRedis(): Promise<CheckResult> {
    if (!isRedisConfigured || !getRedis) {
        return { status: 'ok', latencyMs: 0 }; // Not configured = not required
    }
    const start = Date.now();
    try {
        const client = getRedis();
        if (!client) {
            return { status: 'error', latencyMs: Date.now() - start, error: 'Client unavailable' };
        }
        await client.ping();
        return { status: 'ok', latencyMs: Date.now() - start };
    } catch {
        return { status: 'error', latencyMs: Date.now() - start, error: 'Ping failed' };
    }
}

export async function GET() {
    const start = Date.now();

    // Run checks in parallel for minimum probe latency
    const [database, redis] = await Promise.all([
        checkDatabase(),
        checkRedis(),
    ]);

    const checks: Record<string, CheckResult> = { database };
    if (isRedisConfigured) {
        checks.redis = redis;
    }

    const allOk = Object.values(checks).every(c => c.status === 'ok');

    return jsonResponse(
        {
            status: allOk ? 'ready' : 'not_ready',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: process.env.BUILD_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'dev',
            checks,
            latencyMs: Date.now() - start,
        },
        { status: allOk ? 200 : 503 },
    );
}
