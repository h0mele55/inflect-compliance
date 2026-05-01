'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { OnboardingTourProvider } from '@/components/ui/OnboardingTour';

/**
 * Client-only providers for the tenant app.
 *
 * This wrapper isolates all client-runtime providers from server-rendered
 * layouts, making the server/client boundary explicit and clean.
 *
 * Currently wraps:
 *   - QueryClientProvider (react-query) — required by pages that use
 *     useQuery/useMutation for data fetching
 *   - OnboardingTourProvider (Driver.js-based product tour) — owns the
 *     auto-trigger gate + completion persistence; <StartTourButton>
 *     in the sidebar consumes it via useOnboardingTour()
 *
 * NOT included here (and why):
 *   - SessionProvider — lives in root layout (src/app/providers.tsx) because
 *     it's needed app-wide, including non-tenant routes like /login
 *   - NextIntlClientProvider — lives in root layout, driven by server-resolved
 *     locale/messages
 *   - TenantProvider — lives in tenant layout (src/app/t/[tenantSlug]/layout.tsx),
 *     driven by server-resolved tenant context
 *
 * @example
 * ```tsx
 * // In a server layout:
 * <ClientProviders userId={session.user.id}>
 *   {children}
 * </ClientProviders>
 * ```
 */
export function ClientProviders({
    children,
    userId,
}: {
    children: React.ReactNode;
    /** Authenticated user id — passed in from the server layout so the
     *  Driver.js tour can persist completion per-user. Null on routes
     *  rendered before authentication completes; the provider stays
     *  inert in that case. */
    userId?: string | null;
}) {
    return (
        <QueryClientProvider client={getQueryClient()}>
            <OnboardingTourProvider userId={userId ?? null}>
                {children}
            </OnboardingTourProvider>
        </QueryClientProvider>
    );
}
