import { NextRequest, NextResponse } from 'next/server';
import { requireAdminCtx } from '@/lib/auth/require-admin';
import { listApiKeys, createApiKey } from '@/app-layer/usecases/api-keys';
import { withApiErrorHandling } from '@/lib/errors/api';
import { API_KEY_CREATE_LIMIT } from '@/lib/security/rate-limit-middleware';
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
    return NextResponse.json<any>(keys);
});

// API key minting is the canonical post-compromise amplification surface:
// a stolen session can create persistent machine credentials. Override
// the default API_MUTATION_LIMIT with the tight API_KEY_CREATE_LIMIT
// (5/hr, 1hr lockout) and a dedicated scope so the budget never
// competes with ordinary mutation traffic.
export const POST = withApiErrorHandling(async (
    req: NextRequest,
    { params }: { params: { tenantSlug: string } },
) => {
    const ctx = await requireAdminCtx(params, req);
    const body = await req.json();
    const input = CreateApiKeySchema.parse(body);
    const result = await createApiKey(ctx, input);
    return NextResponse.json<any>(result, { status: 201 });
}, {
    rateLimit: { config: API_KEY_CREATE_LIMIT, scope: 'api-key-create' },
});
