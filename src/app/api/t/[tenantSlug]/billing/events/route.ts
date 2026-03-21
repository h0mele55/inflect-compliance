import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { listBillingEvents } from '@/lib/entitlements-server';

/**
 * GET /api/t/[tenantSlug]/billing/events
 * Returns recent billing events for the tenant (admin-only).
 * Query params: ?limit=20
 */
export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);

    if (ctx.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);

    const events = await listBillingEvents(ctx.tenantId, limit);

    return NextResponse.json({ events });
});
