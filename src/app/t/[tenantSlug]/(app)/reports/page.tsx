import { getTranslations } from 'next-intl/server';
import { getTenantCtx } from '@/app-layer/context';
import { getReports } from '@/app-layer/usecases/report';
import { ReportsClient } from './ReportsClient';

export const dynamic = 'force-dynamic';

/**
 * Reports — Server Component wrapper.
 * Fetches SoA + risk register data server-side, delegates interactive
 * tabs and CSV export to client island.
 */
export default async function ReportsPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const t = await getTranslations('reports');
    const tc = await getTranslations('common');
    const ctx = await getTenantCtx({ tenantSlug });
    const data = await getReports(ctx);

    return (
        <div className="space-y-6 animate-fadeIn">
            <ReportsClient
                data={JSON.parse(JSON.stringify(data))}
                translations={{
                    title: t('title'),
                    subtitle: t('subtitle'),
                    exportSoa: t('exportSoa'),
                    exportRisks: t('exportRisks'),
                    soa: t('soa'),
                    riskRegister: t('riskRegister'),
                    control: t('control'),
                    name: t('name'),
                    applicable: t('applicable'),
                    status: t('status'),
                    evidence: t('evidence'),
                    overdue: t('overdue'),
                    risk: t('risk'),
                    asset: t('asset'),
                    threat: t('threat'),
                    score: t('score'),
                    treatment: t('treatment'),
                    owner: t('owner'),
                    controls: t('controls'),
                    yes: tc('yes'),
                    no: tc('no'),
                }}
            />
        </div>
    );
}
