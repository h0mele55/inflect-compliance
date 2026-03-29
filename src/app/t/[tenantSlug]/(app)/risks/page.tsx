import { getTranslations } from 'next-intl/server';
import { getTenantCtx } from '@/app-layer/context';
import { listRisks } from '@/app-layer/usecases/risk';
import { RisksClient } from './RisksClient';

export const dynamic = 'force-dynamic';

/**
 * Risks — Server Component.
 * Fetches risk list server-side (with URL filters applied),
 * delegates interaction to client island.
 */
export default async function RisksPage({
    params,
    searchParams,
}: {
    params: Promise<{ tenantSlug: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { tenantSlug } = await params;
    const sp = await searchParams;
    const t = await getTranslations('risks');
    const td = await getTranslations('riskManager');
    const ctx = await getTenantCtx({ tenantSlug });

    // Build filters from searchParams for server-side data fetch
    const filters: Record<string, string> = {};
    for (const key of ['q', 'status', 'category']) {
        const val = sp[key];
        if (typeof val === 'string' && val) filters[key] = val;
    }

    const risks = await listRisks(ctx, Object.keys(filters).length > 0 ? filters : undefined);

    return (
        <RisksClient
            initialRisks={JSON.parse(JSON.stringify(risks))}
            initialFilters={filters}
            tenantSlug={tenantSlug}
            permissions={ctx.permissions}
            translations={{
                title: t('title'),
                risksIdentified: t('risksIdentified', { count: risks.length }),
                heatmap: t('heatmap'),
                register: t('register'),
                addRisk: t('addRisk'),
                riskTitle: t('riskTitle'),
                asset: t('asset'),
                threat: t('threat'),
                score: t('score'),
                level: t('level'),
                treatment: t('treatment'),
                controlsCol: t('controlsCol'),
                noRisks: t('noRisks'),
                low: t('low'),
                medium: t('medium'),
                high: t('high'),
                critical: t('critical'),
                untreated: t('untreated'),
                heatmapTitle: t('heatmapTitle'),
                totalRisks: td('totalRisks'),
                avgScore: td('avgScore'),
                openRisks: td('openRisks'),
                overdueReviews: td('overdueReviews'),
            }}
        />
    );
}
