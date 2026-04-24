/**
 * POST /api/admin/tenants/:slug/transfer-ownership
 *
 * Platform-admin endpoint for programmatic ownership transfer. Gated by
 * `PLATFORM_ADMIN_API_KEY` (X-Platform-Admin-Key header). Promotes the
 * new OWNER before demoting the old one to satisfy the DB trigger.
 *
 * Permission: platform-admin-key-gated — does not use requirePermission;
 * excluded from api-permission-coverage.test.ts guardrail with a reason.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiErrorHandling } from '@/lib/errors/api';
import { verifyPlatformApiKey, PlatformAdminError } from '@/lib/auth/platform-admin';
import { transferTenantOwnership } from '@/app-layer/usecases/tenant-lifecycle';
import { z } from 'zod';
import prisma from '@/lib/prisma';

const Body = z.object({
    currentOwnerUserId: z.string().min(1),
    newOwnerEmail: z.string().email(),
});

export const POST = withApiErrorHandling(
    async (req: NextRequest, ctx: { params: Promise<{ slug: string }> }) => {
        try {
            verifyPlatformApiKey(req);
        } catch (err) {
            if (err instanceof PlatformAdminError) {
                return NextResponse.json(
                    { error: err.message },
                    { status: err.status },
                );
            }
            throw err;
        }

        const { slug } = await ctx.params;
        const body = Body.parse(await req.json());

        // Resolve tenant by slug.
        const tenant = await prisma.tenant.findUnique({
            where: { slug },
            select: { id: true },
        });
        if (!tenant) {
            return NextResponse.json(
                { error: `Tenant not found: ${slug}` },
                { status: 404 },
            );
        }

        const result = await transferTenantOwnership({
            tenantId: tenant.id,
            currentOwnerUserId: body.currentOwnerUserId,
            newOwnerEmail: body.newOwnerEmail,
        });

        return NextResponse.json(result, { status: 200 });
    },
);
