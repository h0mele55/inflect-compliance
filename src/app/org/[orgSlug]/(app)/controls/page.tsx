import { notFound } from 'next/navigation';

import { getOrgCtx } from '@/app-layer/context';
import { getNonPerformingControls } from '@/app-layer/usecases/portfolio';
import { ControlsTable } from './ControlsTable';

/**
 * Epic O-4 — Non-performing controls (cross-tenant).
 *
 * Aggregates `applicability=APPLICABLE` controls whose `status` is
 * NOT `IMPLEMENTED` from every linked tenant, attributed to the
 * source tenant. Each row links to the tenant's own control detail
 * page where the CISO's auto-provisioned AUDITOR membership unlocks
 * read access under RLS.
 */
export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

export default async function OrgControlsPage({ params }: PageProps) {
    const { orgSlug } = await params;

    let ctx;
    try {
        ctx = await getOrgCtx({ orgSlug });
    } catch {
        notFound();
    }

    const rows = await getNonPerformingControls(ctx);

    return <ControlsTable rows={JSON.parse(JSON.stringify(rows))} />;
}
