import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listAudits, createAudit } from '@/app-layer/usecases/audit';
import { withValidatedBody } from '@/lib/validation/route';
import { CreateAuditSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const audits = await listAudits(ctx);
    return jsonResponse(audits);
});

export const POST = withApiErrorHandling(withValidatedBody(CreateAuditSchema, async (req, { params }: { params: { tenantSlug: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const audit = await createAudit(ctx, body);
    return jsonResponse(audit, { status: 201 });
}));
