import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { updateTenantMemberRole } from '@/app-layer/usecases/tenant-admin';
import { withApiErrorHandling } from '@/lib/errors/api';
import { z } from 'zod';

const UpdateRoleSchema = z.object({
    role: z.enum(['ADMIN', 'EDITOR', 'AUDITOR', 'READER']),
});

export const PATCH = withApiErrorHandling(async (
    req: NextRequest,
    { params }: { params: { tenantSlug: string; membershipId: string } }
) => {
    const ctx = await getTenantCtx(params, req);
    const body = await req.json();
    const input = UpdateRoleSchema.parse(body);
    const result = await updateTenantMemberRole(ctx, {
        membershipId: params.membershipId,
        role: input.role,
    });
    return NextResponse.json(result);
});
