import { notFound } from 'next/navigation';

import { getOrgCtx } from '@/app-layer/context';
import { getCriticalRisksAcrossOrg } from '@/app-layer/usecases/portfolio';
import { RisksTable } from './RisksTable';

/**
 * Epic O-4 — Critical risks (cross-tenant).
 *
 * `inherentScore ≥ 15` AND `status ≠ CLOSED`. One row per risk,
 * tenant-attributed. Drill-down lands on `/t/{slug}/risks/{riskId}`.
 */
export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

export default async function OrgRisksPage({ params }: PageProps) {
    const { orgSlug } = await params;

    let ctx;
    try {
        ctx = await getOrgCtx({ orgSlug });
    } catch {
        notFound();
    }

    const rows = await getCriticalRisksAcrossOrg(ctx);

    return <RisksTable rows={JSON.parse(JSON.stringify(rows))} />;
}
