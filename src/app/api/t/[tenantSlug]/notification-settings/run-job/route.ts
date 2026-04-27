import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { processOutbox } from '@/app-layer/notifications/processOutbox';
import { runDailyEvidenceExpiryNotifications } from '@/app-layer/jobs/dailyEvidenceExpiry';

export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    // Epic 1 — OWNER is a superset of ADMIN per CLAUDE.md RBAC.
    if (ctx.role !== 'OWNER' && ctx.role !== 'ADMIN') {
        return NextResponse.json<any>({ error: 'Forbidden: insufficient permissions' }, { status: 403 });
    }

    const body = await req.json();
    const jobType = body.jobType;

    if (jobType === 'processOutbox') {
        const stats = await processOutbox({ limit: 100 });
        return NextResponse.json<any>({ success: true, stats, message: 'Outbox processed successfully (Global)' });
    }

    if (jobType === 'dailySweep') {
        const stats = await runDailyEvidenceExpiryNotifications({ tenantId: ctx.tenantId });
        return NextResponse.json<any>({ success: true, stats, message: 'Daily sweep executed successfully' });
    }

    return NextResponse.json<any>({ error: 'Invalid job type' }, { status: 400 });
});
