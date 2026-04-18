import { NextRequest, NextResponse } from 'next/server';
import { requireAdminCtx } from '@/lib/auth/require-admin';
import { listApiKeys, createApiKey } from '@/app-layer/usecases/api-keys';
import { withApiErrorHandling } from '@/lib/errors/api';
import { z } from 'zod';

const CreateApiKeySchema = z.object({
    name: z.string().min(1).max(100),
    scopes: z.array(z.string()).min(1),
    expiresAt: z.string().nullable().optional(),
});

export const GET = withApiErrorHandling(async (
    req: NextRequest,
    { params }: { params: { tenantSlug: string } },
) => {
    const ctx = await requireAdminCtx(params, req);
    const keys = await listApiKeys(ctx);
    return NextResponse.json(keys);
});

export const POST = withApiErrorHandling(async (
    req: NextRequest,
    { params }: { params: { tenantSlug: string } },
) => {
    const ctx = await requireAdminCtx(params, req);
    const body = await req.json();
    const input = CreateApiKeySchema.parse(body);
    const result = await createApiKey(ctx, input);
    return NextResponse.json(result, { status: 201 });
});
