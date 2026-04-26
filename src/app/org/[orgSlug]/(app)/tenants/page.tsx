import { notFound } from 'next/navigation';

import { getOrgCtx } from '@/app-layer/context';
import { getPortfolioTenantHealth } from '@/app-layer/usecases/portfolio';
import { TenantsTable } from './TenantsTable';

/**
 * Epic O-4 — Tenant Health list page.
 *
 * One row per linked tenant. Each row is a drill-down anchor into the
 * tenant's own dashboard at `/t/{slug}/dashboard` — the CISO's auto-
 * provisioned AUDITOR membership unlocks read access there.
 *
 * Read-only. No mutation surfaces (members + settings live on their
 * own org pages); this is purely an aggregate view of tenant health.
 */
export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

export default async function OrgTenantsPage({ params }: PageProps) {
    const { orgSlug } = await params;

    let ctx;
    try {
        ctx = await getOrgCtx({ orgSlug });
    } catch {
        notFound();
    }

    const rows = await getPortfolioTenantHealth(ctx);

    return (
        <TenantsTable
            rows={JSON.parse(JSON.stringify(rows))}
            orgSlug={orgSlug}
        />
    );
}
