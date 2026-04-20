/**
 * DELETE /api/t/[tenantSlug]/tests/runs/[runId]/evidence/[linkId] — Unlink evidence from a test run
 */
import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { unlinkEvidenceFromRun } from '@/app-layer/usecases/control-test';
import { withApiErrorHandling } from '@/lib/errors/api';

export const DELETE = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; runId: string; linkId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    await unlinkEvidenceFromRun(ctx, params.linkId);
    return NextResponse.json<any>({ ok: true });
});
