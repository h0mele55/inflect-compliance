import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getDefaultTenantForUser } from '@/lib/tenant-context';

/**
 * Root page: redirects authenticated users to their default tenant dashboard.
 * Unauthenticated users are redirected to /login by middleware.
 */
export default async function Home() {
    const session = await auth();

    if (!session?.user?.id) {
        redirect('/login');
    }

    const defaultMembership = await getDefaultTenantForUser(session.user.id);

    if (defaultMembership) {
        redirect(`/t/${defaultMembership.tenant.slug}/dashboard`);
    }

    // No tenant membership — redirect to login with error
    redirect('/login');
}
