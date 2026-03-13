import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listContributors, addContributor } from '@/app-layer/usecases/control';
import { withValidatedBody } from '@/lib/validation/route';
import { AddContributorSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; controlId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const contributors = await listContributors(ctx, params.controlId);
    return NextResponse.json(contributors);
});

export const POST = withApiErrorHandling(withValidatedBody(AddContributorSchema, async (req, { params }: { params: { tenantSlug: string; controlId: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const contributor = await addContributor(ctx, params.controlId, body.userId);
    return NextResponse.json(contributor, { status: 201 });
}));
