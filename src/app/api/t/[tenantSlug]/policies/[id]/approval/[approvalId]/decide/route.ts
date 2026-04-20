import { NextRequest, NextResponse } from 'next/server';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { getTenantCtx } from '@/app-layer/context';
import { DecideApprovalSchema } from '@/lib/schemas';
import * as policyUsecases from '@/app-layer/usecases/policy';

// POST /api/t/[tenantSlug]/policies/[id]/approval/[approvalId]/decide — approve or reject
export const POST = withApiErrorHandling(
    withValidatedBody(DecideApprovalSchema, async (req: NextRequest, { params }: { params: { tenantSlug: string; id: string; approvalId: string } }, body) => {
        const ctx = await getTenantCtx(params, req);
        const result = await policyUsecases.decidePolicyApproval(ctx, params.approvalId, body);
        return NextResponse.json<any>(result);
    })
);
