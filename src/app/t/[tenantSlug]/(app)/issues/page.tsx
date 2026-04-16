import { redirect } from 'next/navigation';

/**
 * Legacy redirect: /issues → /tasks
 * Server-side redirect — zero client JS shipped.
 */
export default async function IssuesRedirect({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    redirect(`/t/${tenantSlug}/tasks`);
}
