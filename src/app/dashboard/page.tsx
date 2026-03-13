import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getDefaultTenantForUser } from '@/lib/tenant-context';

/**
 * Legacy /dashboard redirect shim.
 * Redirects to /t/<defaultTenantSlug>/dashboard.
 */
export default async function DashboardRedirect() {
    const session = await auth();

    if (!session?.user?.id) {
        redirect('/login');
    }

    const defaultMembership = await getDefaultTenantForUser(session.user.id);

    if (defaultMembership) {
        redirect(`/t/${defaultMembership.tenant.slug}/dashboard`);
    }

    redirect('/login');
}
