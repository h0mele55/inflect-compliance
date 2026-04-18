import { NextRequest, NextResponse } from 'next/server';
import { requireAdminCtx } from '@/lib/auth/require-admin';
import { updateTenantMemberRole } from '@/app-layer/usecases/tenant-admin';
import { assignCustomRole } from '@/app-layer/usecases/custom-roles';
import { withApiErrorHandling } from '@/lib/errors/api';
import { z } from 'zod';

const UpdateMemberSchema = z.object({
    role: z.enum(['ADMIN', 'EDITOR', 'AUDITOR', 'READER']).optional(),
    customRoleId: z.string().nullable().optional(),
});

export const PATCH = withApiErrorHandling(async (
    req: NextRequest,
    { params }: { params: { tenantSlug: string; membershipId: string } }
) => {
    const ctx = await requireAdminCtx(params, req);
    const body = await req.json();
    const input = UpdateMemberSchema.parse(body);

    let result;

    // If role change requested, update enum role
    if (input.role) {
        result = await updateTenantMemberRole(ctx, {
            membershipId: params.membershipId,
            role: input.role,
        });
    }

    // If customRoleId change requested (even if null = unassign)
    if (input.customRoleId !== undefined) {
        result = await assignCustomRole(ctx, params.membershipId, input.customRoleId);
    }

    if (!result) {
        return NextResponse.json({ error: 'No changes specified' }, { status: 400 });
    }

    return NextResponse.json(result);
});
