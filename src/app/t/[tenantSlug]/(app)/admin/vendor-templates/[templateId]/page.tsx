/**
 * Epic G-3 — vendor questionnaire builder.
 *
 * Loads the full template tree (sections + questions) and hands
 * it to the client builder. Client owns DnD + form state.
 */
import { VendorTemplateBuilderClient } from './VendorTemplateBuilderClient';

export const dynamic = 'force-dynamic';

export default async function VendorTemplateBuilderPage({
    params,
}: {
    params: Promise<{ tenantSlug: string; templateId: string }>;
}) {
    const { templateId } = await params;
    return <VendorTemplateBuilderClient templateId={templateId} />;
}
