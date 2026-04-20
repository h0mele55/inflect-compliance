import { redirect } from 'next/navigation';

/**
 * Epic 54 — `/risks/new` compatibility shim.
 *
 * Risk creation moved from a full-page wizard into a modal mounted inside
 * the Risks list (`src/.../risks/NewRiskModal.tsx`). This route still
 * exists so bookmarks, "+ New Risk" deep links, and E2E tests that
 * `page.goto('/risks/new')` continue to work — they all land on
 * `/risks?create=1`, which RisksClient detects on mount and opens the
 * modal automatically. The flag is then stripped from the URL so
 * subsequent back/forward doesn't re-open the modal unexpectedly.
 */
export default async function NewRiskRedirect({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    redirect(`/t/${tenantSlug}/risks?create=1`);
}
