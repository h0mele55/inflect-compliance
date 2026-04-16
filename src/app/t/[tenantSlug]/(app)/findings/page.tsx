import { getTranslations } from 'next-intl/server';
import { getTenantCtx } from '@/app-layer/context';
import { listFindings } from '@/app-layer/usecases/finding';
import { FindingsClient } from './FindingsClient';

export const dynamic = 'force-dynamic';

/**
 * Findings — Server Component wrapper.
 * Fetches findings data server-side, delegates interactive table to client island.
 */
export default async function FindingsPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;

    // Translations and tenant context are independent — fetch in parallel
    const [t, tc, ctx] = await Promise.all([
        getTranslations('findings'),
        getTranslations('common'),
        getTenantCtx({ tenantSlug }),
    ]);
    const findings = await listFindings(ctx);

    return (
        <div className="space-y-6 animate-fadeIn">
            <FindingsClient
                initialFindings={JSON.parse(JSON.stringify(findings))}
                tenantSlug={tenantSlug}
                translations={{
                    title: t('title'),
                    open: t('open'),
                    newFinding: t('newFinding'),
                    findingTitle: t('findingTitle'),
                    severity: t('severity'),
                    type: t('type'),
                    owner: t('owner'),
                    status: t('status'),
                    description: t('description'),
                    dueDate: t('dueDate'),
                    createFinding: t('createFinding'),
                    noFindings: t('noFindings'),
                    low: t('low'),
                    medium: t('medium'),
                    high: t('high'),
                    critical: t('critical'),
                    nonconformity: t('nonconformity'),
                    observation: t('observation'),
                    opportunity: t('opportunity'),
                    inProgress: t('inProgress'),
                    readyForVerification: t('readyForVerification'),
                    closed: t('closed'),
                    cancel: tc('cancel'),
                    actions: tc('actions'),
                }}
            />
        </div>
    );
}
