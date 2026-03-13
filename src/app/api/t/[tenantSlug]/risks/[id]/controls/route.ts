import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { linkControlToRisk } from '@/app-layer/usecases/risk';
import { parseBody } from '@/lib/validation';
import { LinkRiskControlSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { badRequest } from '@/lib/errors/types';

// Map a control to a risk
export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; id: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const { data: body, error } = await parseBody(req, LinkRiskControlSchema);
    if (error) throw badRequest('Invalid Request Body', error);

    const rc = await linkControlToRisk(ctx, params.id, body.controlId);
    return NextResponse.json(rc, { status: 201 });
});
