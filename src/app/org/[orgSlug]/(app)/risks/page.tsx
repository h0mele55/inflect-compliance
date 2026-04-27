import { notFound } from 'next/navigation';

import { getOrgCtx } from '@/app-layer/context';
import { listCriticalRisksAcrossOrg } from '@/app-layer/usecases/portfolio';
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
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OrgRisksPage({ params, searchParams }: PageProps) {
    const { orgSlug } = await params;
    const sp = await searchParams;

    let ctx;
    try {
        ctx = await getOrgCtx({ orgSlug });
    } catch {
        notFound();
    }

    const cursor = typeof sp.cursor === 'string' ? sp.cursor : undefined;
    const result = await listCriticalRisksAcrossOrg(ctx, { cursor });

    return (
        <RisksTable
            rows={JSON.parse(JSON.stringify(result.rows))}
            nextCursor={result.nextCursor}
            orgSlug={orgSlug}
        />
    );
}
