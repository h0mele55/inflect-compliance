import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { freezeBundle } from '@/app-layer/usecases/issue';
import { withApiErrorHandling } from '@/lib/errors/api';

export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; issueId: string; bundleId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const bundle = await freezeBundle(ctx, params.bundleId);
    return NextResponse.json<any>(bundle);
});
