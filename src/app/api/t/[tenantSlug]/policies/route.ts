import { NextRequest, NextResponse } from 'next/server';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { getTenantCtx } from '@/app-layer/context';
import { CreatePolicySchema } from '@/lib/schemas';
import * as policyUsecases from '@/app-layer/usecases/policy';

// GET /api/t/[tenantSlug]/policies — list with filters
export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
  const ctx = await getTenantCtx(params, req);
  const url = req.nextUrl;
  const includeDeleted = url.searchParams.get('includeDeleted') === 'true';
  if (includeDeleted) {
    const policies = await policyUsecases.listPoliciesWithDeleted(ctx);
    return NextResponse.json(policies);
  }
  const filters = {
    status: url.searchParams.get('status') || undefined,
    category: url.searchParams.get('category') || undefined,
    q: url.searchParams.get('q') || undefined,
  };
  const policies = await policyUsecases.listPolicies(ctx, filters);
  return NextResponse.json(policies);
});

// POST /api/t/[tenantSlug]/policies — create (blank or from template)
export const POST = withApiErrorHandling(
  withValidatedBody(CreatePolicySchema, async (req: NextRequest, { params }: { params: { tenantSlug: string } }, body) => {
    const ctx = await getTenantCtx(params, req);

    let policy;
    if (body.templateId) {
      policy = await policyUsecases.createPolicyFromTemplate(ctx, body.templateId, {
        title: body.title,
        description: body.description,
        category: body.category,
        ownerUserId: body.ownerUserId,
        language: body.language,
      });
    } else {
      policy = await policyUsecases.createPolicy(ctx, {
        title: body.title,
        description: body.description,
        category: body.category,
        ownerUserId: body.ownerUserId,
        reviewFrequencyDays: body.reviewFrequencyDays,
        language: body.language,
        content: body.content,
      });
    }

    return NextResponse.json(policy, { status: 201 });
  })
);
