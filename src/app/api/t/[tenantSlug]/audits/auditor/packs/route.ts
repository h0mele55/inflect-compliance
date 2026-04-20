import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getAuditorAssignedPacks } from '@/app-layer/usecases/audit-hardening';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const packs = await getAuditorAssignedPacks(ctx);
    return NextResponse.json<any>(packs);
});
