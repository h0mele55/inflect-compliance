import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listControls, createControl, listControlsWithDeleted } from '@/app-layer/usecases/control';
import { withValidatedBody } from '@/lib/validation/route';
import { CreateControlSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const sp = req.nextUrl.searchParams;
    const includeDeleted = sp.get('includeDeleted') === 'true';
    if (includeDeleted) {
        const controls = await listControlsWithDeleted(ctx);
        return NextResponse.json(controls);
    }
    const controls = await listControls(ctx, {
        status: sp.get('status') ?? undefined,
        applicability: sp.get('applicability') ?? undefined,
        ownerUserId: sp.get('ownerUserId') ?? undefined,
        q: sp.get('q') ?? undefined,
        category: sp.get('category') ?? undefined,
    });
    return NextResponse.json(controls);
});

export const POST = withApiErrorHandling(withValidatedBody(CreateControlSchema, async (req, { params }: { params: { tenantSlug: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const control = await createControl(ctx, body);
    return NextResponse.json(control, { status: 201 });
}));
