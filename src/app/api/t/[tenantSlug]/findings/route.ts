import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listFindings, createFinding } from '@/app-layer/usecases/finding';
import { withValidatedBody } from '@/lib/validation/route';
import { CreateFindingSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const findings = await listFindings(ctx);
    return NextResponse.json<any>(findings);
});

export const POST = withApiErrorHandling(withValidatedBody(CreateFindingSchema, async (req, { params }: { params: { tenantSlug: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finding = await createFinding(ctx, body as any);
    return NextResponse.json<any>(finding, { status: 201 });
}));
