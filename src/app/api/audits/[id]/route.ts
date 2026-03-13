import { NextRequest, NextResponse } from 'next/server';
import { getLegacyCtx } from '@/app-layer/context';
import { getAudit, updateAudit } from '@/app-layer/usecases/audit';
import { withValidatedBody } from '@/lib/validation/route';
import { UpdateAuditSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { id: string } }) => {
    const ctx = await getLegacyCtx(req);
    const audit = await getAudit(ctx, params.id);
    return NextResponse.json(audit);
});

export const PUT = withApiErrorHandling(withValidatedBody(UpdateAuditSchema, async (req, { params }: { params: { id: string } }, body) => {
    const ctx = await getLegacyCtx(req);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const audit = await updateAudit(ctx, params.id, body as any);
    return NextResponse.json({ success: true, audit });
}));
