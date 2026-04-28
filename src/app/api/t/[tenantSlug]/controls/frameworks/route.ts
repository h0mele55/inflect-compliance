import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listFrameworks } from '@/app-layer/usecases/control';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const frameworks = await listFrameworks(ctx);
    return jsonResponse(frameworks);
});
