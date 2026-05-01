/**
 * Epic 49 — Compliance Calendar page (server component shell).
 *
 * Server side resolves tenant context, fetches the initial 12-month
 * window, and hands off to the client island for view-switching +
 * range navigation. Subsequent fetches go through React Query so the
 * server payload is purely the warm-cache.
 */

import { getTenantCtx } from '@/app-layer/context';
import { getComplianceCalendarEvents } from '@/app-layer/usecases/compliance-calendar';
import { CalendarClient } from './CalendarClient';

export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;

export default async function CalendarPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx({ tenantSlug });

    // Default range: 6 months back, 6 months forward — covers heatmap
    // (12 months back), monthly (current view), and Gantt (12-month
    // window centred on today). The client refines from here.
    const now = new Date();
    const from = new Date(now.getTime() - 180 * DAY_MS);
    const to = new Date(now.getTime() + 180 * DAY_MS);

    const initial = await getComplianceCalendarEvents(ctx, {
        from,
        to,
        now,
    });

    return (
        <CalendarClient
            tenantSlug={tenantSlug}
            initial={JSON.parse(JSON.stringify(initial))}
            initialRange={{
                from: from.toISOString(),
                to: to.toISOString(),
            }}
        />
    );
}
