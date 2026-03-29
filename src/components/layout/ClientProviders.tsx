'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';

/**
 * Client-only providers for the tenant app.
 *
 * This wrapper isolates all client-runtime providers from server-rendered
 * layouts, making the server/client boundary explicit and clean.
 *
 * Currently wraps:
 *   - QueryClientProvider (react-query) — required by pages that use
 *     useQuery/useMutation for data fetching
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
 * <ClientProviders>
 *   {children}
 * </ClientProviders>
 * ```
 */
export function ClientProviders({ children }: { children: React.ReactNode }) {
    return (
        <QueryClientProvider client={getQueryClient()}>
            {children}
        </QueryClientProvider>
    );
}
