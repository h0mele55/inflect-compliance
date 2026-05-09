/**
 * /no-tenant — Landing page for authenticated users with no active membership.
 *
 * PR 4 will wire Next.js middleware to redirect here when the JWT has no
 * `tenantId` (i.e. the user signed up / signed in but has not yet accepted
 * any invite). For now this page is reachable directly.
 *
 * The page is purely informational — it tells the user what to do next
 * and provides a sign-out button so they can switch accounts.
 */
import { auth, signOut } from '@/auth';
import { redirect } from 'next/navigation';
import { Heading } from '@/components/ui/typography';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default async function NoTenantPage() {
    const session = await auth();
    if (!session?.user) {
        redirect('/login');
    }

    const email = session.user.email ?? 'your account';

    return (
        <main className="min-h-screen bg-bg-page flex items-center justify-center p-4">
            <Card elevation="floating" className="max-w-md w-full text-center">
                <div className="text-4xl mb-4">&#x1F512;</div>
                <Heading level={1} className="mb-2">
                    No access yet
                </Heading>
                <p className="text-content-muted mb-2">
                    You are signed in as{' '}
                    <span className="font-medium text-content-default">{email}</span>.
                </p>
                <p className="text-content-muted mb-6">
                    You do not have access to any workspace yet. Ask your admin to
                    invite you, then follow the link in the invitation email.
                </p>
                <form
                    action={async () => {
                        'use server';
                        await signOut({ redirectTo: '/login' });
                    }}
                >
                    <Button type="submit" variant="secondary" className="w-full">
                        Sign out
                    </Button>
                </form>
            </Card>
        </main>
    );
}
