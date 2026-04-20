import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { reviewEvidence } from '@/app-layer/usecases/evidence';
import { withValidatedBody } from '@/lib/validation/route';
import { EvidenceReviewSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

// Submit, Approve, or Reject evidence
export const POST = withApiErrorHandling(withValidatedBody(EvidenceReviewSchema, async (req, { params }: { params: { tenantSlug: string; id: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const result = await reviewEvidence(ctx, params.id, body);
    return NextResponse.json<any>(result);
}));
