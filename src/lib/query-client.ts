import { QueryClient } from '@tanstack/react-query';

/**
 * Singleton QueryClient for the entire app.
 *
 * Configured with sensible defaults:
 * - staleTime: 30 s — avoid refetching on every mount
 * - retry: 1 — one automatic retry on transient failures
 * - refetchOnWindowFocus: true — keep data fresh when user returns
 */
function makeQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 30_000,
                retry: 1,
                refetchOnWindowFocus: true,
            },
            mutations: {
                retry: 0,
            },
        },
    });
}

let browserQueryClient: QueryClient | undefined;

/**
 * Returns a stable QueryClient instance.
 * In the browser a singleton is reused; on the server a new one is created per request.
 */
export function getQueryClient(): QueryClient {
    if (typeof window === 'undefined') {
        // Server: always create a new client (no shared state between requests)
        return makeQueryClient();
    }
    if (!browserQueryClient) {
        browserQueryClient = makeQueryClient();
    }
    return browserQueryClient;
}
