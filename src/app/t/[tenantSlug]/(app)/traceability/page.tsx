/**
 * Epic 47.2 — tenant-wide Traceability page (server component).
 *
 * Fetches the full graph payload server-side and passes it to the
 * client island. Mounting the explorer + table client-side after
 * the data is in scope avoids a fetch waterfall and lets the
 * GraphExplorer skip its own loading skeleton — the page-level
 * Next.js loading.tsx handles "page is mounting" instead.
 */

import { getTenantCtx } from '@/app-layer/context';
import { getTraceabilityGraph } from '@/app-layer/usecases/traceability-graph';
import { TraceabilityClient } from './TraceabilityClient';

export const dynamic = 'force-dynamic';

export default async function TraceabilityPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx({ tenantSlug });
    const graph = await getTraceabilityGraph(ctx);

    return (
        <div className="animate-fadeIn">
            <TraceabilityClient
                initialGraph={JSON.parse(JSON.stringify(graph))}
                tenantSlug={tenantSlug}
            />
        </div>
    );
}
