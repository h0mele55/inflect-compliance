/**
 * GET /api/t/[tenantSlug]/tests/runs/[runId]/verify-evidence
 * Re-computes hashes for all FILE-kind evidence and checks against stored values.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { verifyRunEvidence } from '@/app-layer/usecases/test-hardening';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; runId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const result = await verifyRunEvidence(ctx, params.runId);
    return NextResponse.json<any>(result);
});
