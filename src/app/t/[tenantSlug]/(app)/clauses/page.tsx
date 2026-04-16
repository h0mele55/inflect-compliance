import { getTranslations } from 'next-intl/server';
import { getTenantCtx } from '@/app-layer/context';
import { listClauses } from '@/app-layer/usecases/clause';
import { ClausesBrowser } from './ClausesBrowser';

export const dynamic = 'force-dynamic';

/**
 * Clauses — Server Component wrapper.
 * Fetches clause data server-side, delegates interactive browsing to client island.
 */
export default async function ClausesPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;

    // Translation and tenant context are independent — fetch in parallel
    const [t, ctx] = await Promise.all([
        getTranslations('clauses'),
        getTenantCtx({ tenantSlug }),
    ]);
    const clauses = await listClauses(ctx);

    return (
        <div className="space-y-6 animate-fadeIn">
            <h1 className="text-2xl font-bold">{t('title')}</h1>
            <p className="text-slate-400 text-sm">{t('subtitle')}</p>

            <ClausesBrowser
                clauses={JSON.parse(JSON.stringify(clauses))}
                tenantSlug={tenantSlug}
            />
        </div>
    );
}
