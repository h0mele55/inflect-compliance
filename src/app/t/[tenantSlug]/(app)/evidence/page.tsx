import { getTranslations } from 'next-intl/server';
import { getTenantCtx } from '@/app-layer/context';
import { listEvidence } from '@/app-layer/usecases/evidence';
import { listControls } from '@/app-layer/usecases/control';
import { EvidenceClient } from './EvidenceClient';

export const dynamic = 'force-dynamic';

/**
 * Evidence — Server Component wrapper.
 * Fetches evidence + controls server-side, delegates all interaction to client island.
 */
export default async function EvidencePage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;

    // Translations and tenant context are independent — fetch in parallel
    const [t, tc, ctx] = await Promise.all([
        getTranslations('evidence'),
        getTranslations('common'),
        getTenantCtx({ tenantSlug }),
    ]);

    // Data fetches depend on ctx but are independent of each other
    const [evidence, controls] = await Promise.all([
        listEvidence(ctx),
        listControls(ctx),
    ]);

    return (
        <EvidenceClient
            initialEvidence={JSON.parse(JSON.stringify(evidence))}
            initialControls={JSON.parse(JSON.stringify(controls))}
            tenantSlug={tenantSlug}
            permissions={ctx.permissions}
            translations={{
                title: t('title'),
                evidenceItems: t('evidenceItems', { count: 0 }),
                evidenceTitle: t('evidenceTitle'),
                type: t('type'),
                control: t('control'),
                status: t('status'),
                ownerLabel: t('ownerLabel'),
                noEvidence: t('noEvidence'),
                submitForReview: t('submitForReview'),
                approveEvidence: t('approveEvidence'),
                rejectEvidence: t('rejectEvidence'),
                addEvidence: t('addEvidence'),
                createEvidence: t('createEvidence'),
                content: t('content'),
                contentPlaceholder: t('contentPlaceholder'),
                draft: t('draft'),
                submitted: t('submitted'),
                approved: t('approved'),
                rejected: t('rejected'),
                none: tc('none'),
                cancel: tc('cancel'),
                actions: tc('actions'),
            }}
        />
    );
}
