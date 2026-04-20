import { NextRequest, NextResponse } from 'next/server';
import { requireAdminCtx } from '@/lib/auth/require-admin';
import { updateCustomRole, deleteCustomRole } from '@/app-layer/usecases/custom-roles';
import { withApiErrorHandling } from '@/lib/errors/api';
import { z } from 'zod';

const UpdateRoleSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional().nullable(),
    baseRole: z.enum(['ADMIN', 'EDITOR', 'AUDITOR', 'READER']).optional(),
    permissionsJson: z.record(z.record(z.boolean())).optional(),
});

export const PATCH = withApiErrorHandling(async (
    req: NextRequest,
    { params }: { params: { tenantSlug: string; roleId: string } },
) => {
    const ctx = await requireAdminCtx(params, req);
    const body = await req.json();
    const input = UpdateRoleSchema.parse(body);
    const role = await updateCustomRole(ctx, params.roleId, input);
    return NextResponse.json<any>(role);
});

export const DELETE = withApiErrorHandling(async (
    req: NextRequest,
    { params }: { params: { tenantSlug: string; roleId: string } },
) => {
    const ctx = await requireAdminCtx(params, req);
    const result = await deleteCustomRole(ctx, params.roleId);
    return NextResponse.json<any>(result);
});
