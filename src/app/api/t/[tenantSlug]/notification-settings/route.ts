import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { assertCanAdmin } from '@/app-layer/policies/common';
import { runInTenantContext } from '@/lib/db-context';
import {
    getTenantNotificationSettings,
    updateTenantNotificationSettings,
    getOutboxStats,
} from '@/app-layer/notifications/settings';

/** GET — returns tenant notification settings + outbox stats */
export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    assertCanAdmin(ctx);

    const [settings, stats] = await runInTenantContext(ctx, async (db) => {
        return Promise.all([
            getTenantNotificationSettings(db, ctx.tenantId),
            getOutboxStats(db, ctx.tenantId),
        ]);
    });

    return NextResponse.json<any>({ settings, stats });
});

/** PUT — update tenant notification settings (admin-only) */
export const PUT = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    assertCanAdmin(ctx);

    const body = await req.json();
    const updated = await runInTenantContext(ctx, (db) =>
        updateTenantNotificationSettings(db, ctx, {
            enabled: body.enabled,
            defaultFromName: body.defaultFromName,
            defaultFromEmail: body.defaultFromEmail,
            complianceMailbox: body.complianceMailbox || null,
        }),
    );

    return NextResponse.json<any>(updated);
});
