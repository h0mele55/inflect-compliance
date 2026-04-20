import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { mapRequirementToControl, unmapRequirementFromControl } from '@/app-layer/usecases/control';
import { withValidatedBody } from '@/lib/validation/route';
import { MapRequirementSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const POST = withApiErrorHandling(withValidatedBody(MapRequirementSchema, async (req, { params }: { params: { tenantSlug: string; controlId: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const mapping = await mapRequirementToControl(ctx, params.controlId, body.requirementId);
    return NextResponse.json<any>(mapping, { status: 201 });
}));

export const DELETE = withApiErrorHandling(withValidatedBody(MapRequirementSchema, async (req, { params }: { params: { tenantSlug: string; controlId: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    await unmapRequirementFromControl(ctx, params.controlId, body.requirementId);
    return NextResponse.json<any>({ success: true });
}));
