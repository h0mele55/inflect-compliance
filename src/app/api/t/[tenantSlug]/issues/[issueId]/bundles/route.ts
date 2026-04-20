import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listBundles, createBundle } from '@/app-layer/usecases/issue';
import { withValidatedBody } from '@/lib/validation/route';
import { CreateBundleSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; issueId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const bundles = await listBundles(ctx, params.issueId);
    return NextResponse.json<any>(bundles);
});

export const POST = withApiErrorHandling(withValidatedBody(CreateBundleSchema, async (req: NextRequest, { params }: { params: { tenantSlug: string; issueId: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const bundle = await createBundle(ctx, params.issueId, body.name);
    return NextResponse.json<any>(bundle, { status: 201 });
}));
