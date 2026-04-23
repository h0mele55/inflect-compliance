import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/security/permission-middleware';
import { revokeApiKey } from '@/app-layer/usecases/api-keys';
import { withApiErrorHandling } from '@/lib/errors/api';

export const DELETE = withApiErrorHandling(
    requirePermission<{ tenantSlug: string; keyId: string }>(
        'admin.manage',
        async (_req: NextRequest, { params }, ctx) => {
            const result = await revokeApiKey(ctx, params.keyId);
            return NextResponse.json<any>(result);
        },
    ),
);
