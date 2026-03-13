import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listEvidenceLinks, linkEvidence } from '@/app-layer/usecases/control';
import { withValidatedBody } from '@/lib/validation/route';
import { LinkEvidenceSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; controlId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const links = await listEvidenceLinks(ctx, params.controlId);
    return NextResponse.json(links);
});

export const POST = withApiErrorHandling(withValidatedBody(LinkEvidenceSchema, async (req, { params }: { params: { tenantSlug: string; controlId: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const link = await linkEvidence(ctx, params.controlId, body);
    return NextResponse.json(link, { status: 201 });
}));
