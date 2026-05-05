/**
 * Epic G-3 — vendor assessment reviewer page.
 */
import { VendorAssessmentReviewClient } from './VendorAssessmentReviewClient';

export const dynamic = 'force-dynamic';

export default async function VendorAssessmentReviewPage({
    params,
}: {
    params: Promise<{ tenantSlug: string; assessmentId: string }>;
}) {
    const { assessmentId } = await params;
    return <VendorAssessmentReviewClient assessmentId={assessmentId} />;
}
