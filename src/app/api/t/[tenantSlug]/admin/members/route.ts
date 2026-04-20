import { NextRequest, NextResponse } from 'next/server';
import { requireAdminCtx } from '@/lib/auth/require-admin';
import {
    listTenantMembers,
    inviteTenantMember,
    listPendingInvites,
} from '@/app-layer/usecases/tenant-admin';
import { withApiErrorHandling } from '@/lib/errors/api';
import { z } from 'zod';

const InviteMemberSchema = z.object({
    email: z.string().email('Valid email required'),
    role: z.enum(['ADMIN', 'EDITOR', 'AUDITOR', 'READER']),
});

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await requireAdminCtx(params, req);
    const sp = req.nextUrl.searchParams;
    const view = sp.get('view');

    if (view === 'invites') {
        const invites = await listPendingInvites(ctx);
        return NextResponse.json<any>(invites);
    }

    const members = await listTenantMembers(ctx);
    return NextResponse.json<any>(members);
});

export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await requireAdminCtx(params, req);
    const body = await req.json();
    const input = InviteMemberSchema.parse(body);
    const result = await inviteTenantMember(ctx, input);
    return NextResponse.json<any>(result, { status: 201 });
});
