import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { removeContributor } from '@/app-layer/usecases/control';
import { withApiErrorHandling } from '@/lib/errors/api';

export const DELETE = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; controlId: string; userId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    await removeContributor(ctx, params.controlId, params.userId);
    return NextResponse.json({ success: true });
});
