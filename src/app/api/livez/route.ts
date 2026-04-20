/**
 * GET /api/livez
 *
 * Kubernetes-compatible liveness probe.
 *
 * Returns 200 if the application process is running. This endpoint
 * performs NO dependency checks — it exists solely to confirm the
 * Node.js event loop is responsive. If this returns non-200, the
 * container orchestrator should restart the process.
 *
 * Contract:
 *   200 — process is alive
 *   (never returns anything else while the process is running)
 */
import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json<any>(
        {
            status: 'alive',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
        },
        { status: 200 },
    );
}
