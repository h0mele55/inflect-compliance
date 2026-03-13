import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getFinding, updateFinding } from '@/app-layer/usecases/finding';
import { withValidatedBody } from '@/lib/validation/route';
import { UpdateFindingSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; id: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const finding = await getFinding(ctx, params.id);
    return NextResponse.json(finding);
});

export const PUT = withApiErrorHandling(withValidatedBody(UpdateFindingSchema, async (req, { params }: { params: { tenantSlug: string; id: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finding = await updateFinding(ctx, params.id, body as any);
    return NextResponse.json({ success: true, finding });
}));
