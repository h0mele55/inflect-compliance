import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { installControlsFromTemplate } from '@/app-layer/usecases/control';
import { withValidatedBody } from '@/lib/validation/route';
import { InstallTemplatesSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

// POST /controls/templates/install — install controls from templates
export const POST = withApiErrorHandling(withValidatedBody(InstallTemplatesSchema, async (req, { params }: { params: { tenantSlug: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const results = await installControlsFromTemplate(ctx, body.templateIds);
    return NextResponse.json(results, { status: 201 });
}));
