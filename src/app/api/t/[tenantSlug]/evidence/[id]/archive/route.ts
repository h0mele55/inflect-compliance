/**
 * POST /api/t/[tenantSlug]/evidence/[id]/archive
 * Archive evidence. ADMIN/EDITOR only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { archiveEvidence } from '@/app-layer/usecases/evidence-retention';

export const POST = withApiErrorHandling(async (
    req: NextRequest,
    { params }: { params: { tenantSlug: string; id: string } },
) => {
    const ctx = await getTenantCtx(params, req);
    const result = await archiveEvidence(ctx, params.id);
    return NextResponse.json<any>(result);
});
