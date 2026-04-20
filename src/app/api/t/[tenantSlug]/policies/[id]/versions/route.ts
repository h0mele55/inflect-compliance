import { NextRequest, NextResponse } from 'next/server';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { getTenantCtx } from '@/app-layer/context';
import { CreatePolicyVersionSchema } from '@/lib/schemas';
import * as policyUsecases from '@/app-layer/usecases/policy';

// POST /api/t/[tenantSlug]/policies/[id]/versions — create new version
export const POST = withApiErrorHandling(
    withValidatedBody(CreatePolicyVersionSchema, async (req: NextRequest, { params }: { params: { tenantSlug: string; id: string } }, body) => {
        const ctx = await getTenantCtx(params, req);
        const version = await policyUsecases.createPolicyVersion(ctx, params.id, body);
        return NextResponse.json<any>(version, { status: 201 });
    })
);
