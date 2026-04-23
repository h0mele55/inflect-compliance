import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/security/permission-middleware';
import { withApiErrorHandling } from '@/lib/errors/api';
import { listBillingEvents } from '@/lib/entitlements-server';

/**
 * GET /api/t/[tenantSlug]/billing/events
 * Returns recent billing events for the tenant.
 * Gated by `admin.manage` (Epic D.3).
 * Query params: ?limit=20
 */
export const GET = withApiErrorHandling(
    requirePermission('admin.manage', async (req: NextRequest, _routeArgs, ctx) => {
        const url = new URL(req.url);
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);

        const events = await listBillingEvents(ctx.tenantId, limit);

        return NextResponse.json<any>({ events });
    }),
);
