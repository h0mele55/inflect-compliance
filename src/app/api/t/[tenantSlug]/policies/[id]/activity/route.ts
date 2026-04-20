import { NextRequest, NextResponse } from 'next/server';
import { withApiErrorHandling } from '@/lib/errors/api';
import { getTenantCtx } from '@/app-layer/context';
import { getPolicyActivity } from '@/app-layer/usecases/policy';

// GET /api/t/[tenantSlug]/policies/[id]/activity — policy activity feed
export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; id: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const events = await getPolicyActivity(ctx, params.id);
    return NextResponse.json<any>(events);
});
