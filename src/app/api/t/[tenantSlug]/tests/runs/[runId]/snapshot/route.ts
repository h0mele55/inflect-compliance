/**
 * POST /api/t/[tenantSlug]/tests/runs/[runId]/snapshot
 * Creates immutable snapshot of a test run in an audit pack.
 * Body: { auditPackId: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { snapshotTestRun } from '@/app-layer/usecases/test-hardening';
import { withApiErrorHandling } from '@/lib/errors/api';

export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; runId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const body = await req.json();
    if (!body.auditPackId) {
        return NextResponse.json({ error: 'auditPackId is required' }, { status: 400 });
    }
    const item = await snapshotTestRun(ctx, params.runId, body.auditPackId);
    return NextResponse.json(item, { status: 201 });
});
