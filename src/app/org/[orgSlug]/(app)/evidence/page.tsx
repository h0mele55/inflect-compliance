import { notFound } from 'next/navigation';

import { getOrgCtx } from '@/app-layer/context';
import { getOverdueEvidenceAcrossOrg } from '@/app-layer/usecases/portfolio';
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
}

export default async function OrgEvidencePage({ params }: PageProps) {
    const { orgSlug } = await params;

    let ctx;
    try {
        ctx = await getOrgCtx({ orgSlug });
    } catch {
        notFound();
    }

    const rows = await getOverdueEvidenceAcrossOrg(ctx);

    return <EvidenceTable rows={JSON.parse(JSON.stringify(rows))} />;
}
