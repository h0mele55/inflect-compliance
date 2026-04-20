import { NextRequest, NextResponse } from 'next/server';
import { requireAdminCtx } from '@/lib/auth/require-admin';
import { revokeApiKey } from '@/app-layer/usecases/api-keys';
import { withApiErrorHandling } from '@/lib/errors/api';

export const DELETE = withApiErrorHandling(async (
    req: NextRequest,
    { params }: { params: { tenantSlug: string; keyId: string } },
) => {
    const ctx = await requireAdminCtx(params, req);
    const result = await revokeApiKey(ctx, params.keyId);
    return NextResponse.json<any>(result);
});
