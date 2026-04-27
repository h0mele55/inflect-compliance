import { notFound } from 'next/navigation';

import { getOrgCtx } from '@/app-layer/context';
import { listOverdueEvidenceAcrossOrg } from '@/app-layer/usecases/portfolio';
import { toPlainJson } from '@/lib/server/to-plain-json';
import { EvidenceTable } from './EvidenceTable';

/**
 * Epic O-4 — Overdue evidence (cross-tenant).
 *
 * `nextReviewDate < now` AND `status ≠ APPROVED`. One row per
 * evidence item, tenant-attributed. Drill-down lands on
 * `/t/{slug}/evidence/{evidenceId}` — the per-tenant evidence detail
 * surface.
 */
export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ orgSlug: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OrgEvidencePage({ params, searchParams }: PageProps) {
    const { orgSlug } = await params;
    const sp = await searchParams;

    let ctx;
    try {
        ctx = await getOrgCtx({ orgSlug });
    } catch {
        notFound();
    }

    const cursor = typeof sp.cursor === 'string' ? sp.cursor : undefined;
    const result = await listOverdueEvidenceAcrossOrg(ctx, { cursor });

    // Server→client RSC boundary — see `toPlainJson` for rationale.
    return (
        <EvidenceTable
            rows={toPlainJson(result.rows)}
            nextCursor={result.nextCursor}
            orgSlug={orgSlug}
        />
    );
}
