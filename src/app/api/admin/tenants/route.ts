/**
 * POST /api/admin/tenants
 *
 * Platform-admin endpoint for programmatic tenant creation. Gated by
 * `PLATFORM_ADMIN_API_KEY` (X-Platform-Admin-Key header) — no user
 * session is required or expected. Atomically creates:
 *   - Tenant row (with encrypted DEK)
 *   - OWNER TenantMembership for the ownerEmail
 *   - TenantOnboarding row
 *
 * Rate-limited at TENANT_CREATE_LIMIT (5/hour per platform-key IP).
 *
 * Permission: platform-admin-key-gated — does not use requirePermission;
 * excluded from api-permission-coverage.test.ts guardrail with a reason.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiErrorHandling } from '@/lib/errors/api';
import { verifyPlatformApiKey, PlatformAdminError } from '@/lib/auth/platform-admin';
import { createTenantWithOwner } from '@/app-layer/usecases/tenant-lifecycle';
import { TENANT_CREATE_LIMIT } from '@/lib/security/rate-limit';
import { z } from 'zod';

const Body = z.object({
    name: z.string().min(1).max(200),
    slug: z.string().regex(/^[a-z0-9-]+$/).min(2).max(80),
    ownerEmail: z.string().email(),
});

export const POST = withApiErrorHandling(
    async (req: NextRequest) => {
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

        const body = Body.parse(await req.json());
        const result = await createTenantWithOwner({
            ...body,
            requestId: req.headers.get('x-request-id') ?? 'platform-admin',
        });

        return NextResponse.json(result, { status: 201 });
    },
    {
        rateLimit: {
            config: TENANT_CREATE_LIMIT,
            scope: 'tenant-create',
        },
    },
);
