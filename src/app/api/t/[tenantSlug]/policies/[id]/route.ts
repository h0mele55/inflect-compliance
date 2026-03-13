import { NextRequest, NextResponse } from 'next/server';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { getTenantCtx } from '@/app-layer/context';
import { UpdatePolicyMetadataSchema } from '@/lib/schemas';
import * as policyUsecases from '@/app-layer/usecases/policy';

// GET /api/t/[tenantSlug]/policies/[id] — detail with versions
export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; id: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const policy = await policyUsecases.getPolicy(ctx, params.id);
    return NextResponse.json(policy);
});

// PATCH /api/t/[tenantSlug]/policies/[id] — update metadata
export const PATCH = withApiErrorHandling(
    withValidatedBody(UpdatePolicyMetadataSchema, async (req: NextRequest, { params }: { params: { tenantSlug: string; id: string } }, body) => {
        const ctx = await getTenantCtx(params, req);
        const policy = await policyUsecases.updatePolicyMetadata(ctx, params.id, body);
        return NextResponse.json(policy);
    })
);
