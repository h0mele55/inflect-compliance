import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listControlTemplates, installControlsFromTemplate } from '@/app-layer/usecases/control';
import { withValidatedBody } from '@/lib/validation/route';
import { InstallTemplatesSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

// GET /controls/templates — list available templates
export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const templates = await listControlTemplates(ctx);
    return NextResponse.json(templates);
});
