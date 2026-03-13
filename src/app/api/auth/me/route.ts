import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async () => {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, email: true, name: true, role: true, tenantId: true },
    });

    const tenant = user?.tenantId
        ? await prisma.tenant.findUnique({ where: { id: user.tenantId } })
        : null;

    return NextResponse.json({ user, tenant });
});
