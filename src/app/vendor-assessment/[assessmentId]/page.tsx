/**
 * Epic G-3 — public vendor assessment response page.
 *
 * This route is OUTSIDE the `(app)` and `(auth)` route groups so it
 * does not inherit the authenticated app shell. The path is added
 * to PUBLIC_PATH_PREFIXES in `src/lib/auth/guard.ts` so the
 * middleware skips JWT verification.
 *
 * Token comes only from the URL `?t=...`. The client component
 * passes it through to every API call.
 */
import { VendorAssessmentClient } from './VendorAssessmentClient';

export const dynamic = 'force-dynamic';

export default async function VendorAssessmentPage({
    params,
    searchParams,
}: {
    params: Promise<{ assessmentId: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { assessmentId } = await params;
    const sp = await searchParams;
    const token = typeof sp.t === 'string' ? sp.t : '';

    return (
        <VendorAssessmentClient assessmentId={assessmentId} initialToken={token} />
    );
}
