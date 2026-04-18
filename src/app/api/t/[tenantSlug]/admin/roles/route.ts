import { NextRequest, NextResponse } from 'next/server';
import { requireAdminCtx } from '@/lib/auth/require-admin';
import { listCustomRoles, createCustomRole } from '@/app-layer/usecases/custom-roles';
import { withApiErrorHandling } from '@/lib/errors/api';
import { z } from 'zod';

const CreateRoleSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional().nullable(),
    baseRole: z.enum(['ADMIN', 'EDITOR', 'AUDITOR', 'READER']),
    permissionsJson: z.record(z.record(z.boolean())),
});

export const GET = withApiErrorHandling(async (
    req: NextRequest,
    { params }: { params: { tenantSlug: string } },
) => {
    const ctx = await requireAdminCtx(params, req);
    const roles = await listCustomRoles(ctx);
    return NextResponse.json(roles);
});

export const POST = withApiErrorHandling(async (
    req: NextRequest,
    { params }: { params: { tenantSlug: string } },
) => {
    const ctx = await requireAdminCtx(params, req);
    const body = await req.json();
    const input = CreateRoleSchema.parse(body);
    const role = await createCustomRole(ctx, input);
    return NextResponse.json(role, { status: 201 });
});
